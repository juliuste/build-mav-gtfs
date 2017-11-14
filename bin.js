#!/usr/bin/env node
'use strict'

const mri = require('mri')
const fs = require('fs')
const path = require('path')
const toPromise = require('stream-to-promise')
const isEmpty = require('is-empty-file')
const moment = require('moment-timezone')
const csv = require('csv-string').stringify
const isString = require('lodash.isstring')
const map = require('through2-map').obj

const generateGTFS = require('./index')
const pkg = require('./package.json')

const argv = mri(process.argv.slice(2), {
	boolean: ['help', 'h', 'version', 'v']
})

const opt = {
    start: argv._[0],
    end: argv._[1],
	directory: argv._[2],
    help: argv.help || argv.h,
    version: argv.version || argv.v
}

if (opt.help === true) {
	process.stdout.write(`
build-mav-gtfs [options] start-date end-date gtfs-directory

Arguments:
    start-date			Feed start date: DD.MM.YYYY
    end-date			Feed end date: DD.MM.YYYY (included)
	gtfs-directory		Directory where the generated GTFS will be placed

Options:
    --help       -h  Show this help message.
    --version    -v  Show the version number.

`)
	process.exit(0)
}

if (opt.version === true) {
	process.stdout.write(`${pkg.version}\n`)
	process.exit(0)
}

// main program

const files = ['agency', 'stops', 'routes', 'trips', 'stop_times', 'calendar_dates', 'feed_info']

const main = (opt) => {
	if(!isString(opt.start) || !isString(opt.end) || opt.start.length != 10 || opt.end.length != 10){
		throw new Error('missing or invalid `start-date` or `end-date` parameter, must look like this: `DD.MM.YYYY`')
	}
	const start = moment.tz(opt.start, 'DD.MM.YYYY', 'Europe/Lisbon')
	const end = moment.tz(opt.end, 'DD.MM.YYYY', 'Europe/Lisbon')

	if(+start > +end){
		throw new Error('`end` before `start`')
	}

	const directory = path.resolve(opt.directory)

	generateGTFS(start.toDate(), end.toDate())
	.then((gtfs) => {
		if(!fs.existsSync(directory)) fs.mkdirSync(directory)
		fs.accessSync(directory, fs.constants.W_OK)

		const streams = []

		for(let file in gtfs){
			const filePath = path.join(directory, file + '.txt')
			streams.push(gtfs[file].pipe(map((x) => csv(x, ','))).pipe(fs.createWriteStream(filePath)))
		}

		Promise.all(streams.map(toPromise))
		.then((done) => {
			let i = 0
			for(let file in gtfs){
				const filePath = path.join(directory, file + '.txt')
				if(isEmpty(filePath)){
					fs.unlinkSync(filePath)
					i++
				}
			}
			console.log(`${files.length - i} files written`)
		})
		.catch((error) => {
			console.error(error)
			throw new Error(error)
		})
	})
	.catch((error) => {
		console.error(error)
		throw new Error(error)
	})
}

main(opt)
