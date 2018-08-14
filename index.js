'use strict'

const mav = require('mav')
const retry = require('p-retry')
const timeout = require('p-timeout')
const queue = require('queue')
const ndjson = require('ndjson')
const momentTz = require('moment-timezone')
const groupBy = require('lodash.groupby')
const uniqBy = require('lodash.uniqby')
const fs = require('fs')
const union = require('lodash.union')
const map = require('through2-map').obj
const toStream = require('into-stream').obj

const stream = () => map((x) => x)

const departureRequest = (station, date) => {
    console.info('departures', station.id, station.name, momentTz.tz(date, 'Europe/Budapest').format('DD.MM.YYYY'))
    return retry(
        () => timeout(
            mav.departures(station, date)
            .then((res) => res || []),
            10000
        ),
        {retries: 3}
    )
}

const fetchTrains = (dates, stations) => {
    const q = queue({concurrency: 16})

    return new Promise((resolve, reject) => {
        let trains = []
        for(let date of dates){
            for(let station of stations){
                q.push((cb) =>
                    departureRequest(station, date)
                    .then((fetchedTrains) => {
                        const newTrains = fetchedTrains.map((x) => ({id: x.train.id, number: x.train.number || x.train.id}))
                        trains = uniqBy(union(trains, newTrains), (x) => x.id)
                        cb()
                    })
                    .catch(() => cb())
                )
            }
        }
        q.start()
        q.on('error', reject)
        q.on('end', () => resolve(trains))
    })
}

const generateDates = (start, end, tz) => {
    const dates = []
    const startDate = momentTz.tz(start, tz).startOf('day')
    const endDate = momentTz.tz(end, tz).startOf('day')
    let currentDate = momentTz.tz(startDate, tz)
    while(+currentDate <= +endDate){
        dates.push(currentDate.toDate())
        currentDate.add(1, 'days')
    }
    return dates
}

const fetchTimetables = (trains) => {
    const q = queue({concurrency: 16})
    return new Promise((resolve, reject) => {
        const timetables = []
        let counter = 0
        for(let train of trains){
            q.push((cb) => {
                console.info('train '+counter+'/'+trains.length)
                counter++
                return mav.trains(train.id)
                .then((timetable) => {
                    if(timetable) timetables.push(timetable)
                    cb()
                })
                .catch(() => cb())
            })
        }
        q.start()
        q.on('error', reject)
        q.on('end', () => resolve(timetables))
    })
}

const normalizeDate = (d, refD) => {
    const date = momentTz.tz(+d, 'Europe/Budapest')
    const refDate = momentTz.tz(+refD, 'Europe/Budapest').startOf('day')
    return (+d-(+refD))
}

const hashStop = (s) => [s.id, normalizeDate(s.arrival, s.arrival), normalizeDate(s.departure, s.arrival)].join('_-_')
const hashTimetable = (t) => [t.number || t.id].concat(t.stops.map(hashStop)).join('#@#')

const getTime = (d, refD) => {
    const date = momentTz.tz(+d, 'Europe/Budapest')
    const refDate = momentTz.tz(+refD, 'Europe/Budapest').startOf('day')
    // return (+d-(+refD))
    return date.format('HH:mm:ss')
}

const toGTFS = (dates) => (timetables) => {
    const byTrip = groupBy(timetables, (x) => hashTimetable(x))
    const result = {}
    result.trips = []
    result.stop_times = []
    result.calendar_dates = []

    // trips
    // stop_times
    // calendar_dates
    let i = 0
    for(let key in byTrip){
        const trip = byTrip[key][0]
        result.trips.push([trip.number || trip.id, (trip.number || trip.id)+'-'+i, (trip.number || trip.id)+'-'+i, '', '', '', '', '', '', ''])
        let j = 0
        for(let stop of trip.stops){
            result.stop_times.push([(trip.number || trip.id)+'-'+i, getTime(stop.arrival, stop.arrival), getTime(stop.departure, stop.arrival), j, '', '', '', '', '', ''])
            j++
        }
        for(let trip of byTrip[key]){
            result.calendar_dates.push([(trip.number || trip.id)+'-'+i, momentTz.tz(trip.stops[0].departure, 'Europe/Budapest').format('YYYYMMDD'), 1])
        }
        i++
    }

    return result
}

const fetchTrips = async (trains, gtfs, dates) => {
    const data = await fetchTimetables(trains).then(toGTFS(dates)).catch(console.error)
    for(let key in data){
        for(let row of data[key]) gtfs[key].write(row)
    }
    return 1
}

const fetch = async (startDate, endDate, timezone='Europe/Budapest') => {
    if(generateDates(new Date(), endDate, timezone).length > 25) throw new Error('GTFS can only be generated max. 25 days in advance')
    const dates = generateDates(startDate, endDate, timezone)
    const stations = (await mav.stations()) // .filter((x) => +x.id < 1000)
    const trains = await fetchTrains(dates, stations)

    const routes = uniqBy(trains, (x) => x.number)

    const feedStart = momentTz.tz(startDate, timezone).format('YYYYMMDD')
    const feedEnd = momentTz.tz(endDate, timezone).format('YYYYMMDD')
    const gtfs = {
        agency: toStream([
            ['agency_id', 'agency_name', 'agency_url', 'agency_timezone', 'agency_lang', 'agency_phone', 'agency_fare_url', 'agency_email'],
            ['máv', 'Magyar Államvasutak', 'https://www.mavcsoport.hu/', 'Europe/Budapest', 'hu', '+3613494949', 'https://www.mavcsoport.hu/', 'informacio@mav-start.hu']
        ]),
        stops: toStream(Array(
            ['stop_id', 'stop_code', 'stop_name', 'stop_desc', 'stop_lat', 'stop_lon', 'zone_id', 'stop_url', 'location_type', 'parent_station', 'stop_timezone', 'wheelchair_boarding'],
            ...stations.map((s) => [s.id, '', s.name, '', s.coordinates ? s.coordinates.latitude : '', s.coordinates ? s.coordinates.longitude : '', '', '', 0, '', '', ''])
        )),
        routes: toStream(Array(
            ['route_id', 'agency_id', 'route_short_name', 'route_long_name', 'route_desc', 'route_type', 'route_url', 'route_color', 'route_text_color'],
            ...routes.map((r) => [r.number, 'máv', ''+r.number, ''+r.number, '', 2, '', '', '']) // todo: type
        )),
        trips: stream(),
        stop_times: stream(),
        // calendar: stream(),
        calendar_dates: stream(),
        feed_info: toStream([
            ['feed_publisher_name', 'feed_publisher_url', 'feed_lang', 'feed_start_date', 'feed_end_date', 'feed_version'],
            ['gtfs.directory', 'https://gtfs.directory', 'en', feedStart, feedEnd, '']
        ])
    }
    gtfs.trips.push(['route_id', 'service_id', 'trip_id', 'trip_headsign', 'trip_short_name', 'direction_id', 'block_id', 'shape_id', 'wheelchair_accessible', 'bikes_allowed'])
    gtfs.stop_times.push(['trip_id', 'arrival_time', 'departure_time', 'stop_id', 'stop_sequence', 'stop_headsign', 'pickup_type', 'drop_off_type', 'shape_dist_traveled', 'timepoint'])
    gtfs.calendar_dates.push(['service_id', 'date', 'exception_type'])
    await fetchTrips(trains, gtfs, dates)
    gtfs.trips.end()
    gtfs.stop_times.end()
    gtfs.calendar_dates.end()
    return gtfs
}

const build = (startDate, endDate) => fetch(startDate, endDate)

module.exports = build
