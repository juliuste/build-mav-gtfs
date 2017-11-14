# build-mav-gtfs

Build [GTFS](https://developers.google.com/transit/gtfs/) from the [Magyar Államvasutak](https://www.mavcsoport.hu/) (MÁV, Hungarian State Railways) REST API using the [mav](https://github.com/juliuste/mav) JS module. Please ask MÁV for permission before using this module in production.

**Please note that the data basis used by the MÁV API allows GTFS data to be generated only 25 days in advance.**

*Work in progress. This software is not stable yet. See the [to-do](#to-do) section.*

[![npm version](https://img.shields.io/npm/v/build-mav-gtfs.svg)](https://www.npmjs.com/package/build-mav-gtfs)
[![dependency status](https://img.shields.io/david/juliuste/build-mav-gtfs.svg)](https://david-dm.org/juliuste/build-mav-gtfs)
[![dev dependency status](https://img.shields.io/david/dev/juliuste/build-mav-gtfs.svg)](https://david-dm.org/juliuste/build-mav-gtfs#info=devDependencies)
[![license](https://img.shields.io/github/license/juliuste/build-mav-gtfs.svg?style=flat)](LICENSE)
[![chat on gitter](https://badges.gitter.im/juliuste.svg)](https://gitter.im/juliuste)

## Installation

### Library

```shell
npm install --save build-mav-gtfs
```

### CLI
```shell
npm install -g build-mav-gtfs
```

## Usage

### Library

The script takes a `startDate` and an `endDate` JS `Date()` object (the feed will include the `endDate`, days will be calculated in `Europe/Lisbon` timezone) and return a [`Promise`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/promise) that will resolve in an object containing GTFS object streams:

```js
const generateGTFS = require('build-mav-gtfs')

generateGTFS(new Date("2017-12-01T00:00:00"), new Date("2018-05-31T00:00:00"))
.then((gtfs) => {
    gtfs.routes.pipe(someStream)
    gtfs.stops.pipe(anotherStream)
})
```

The GTFS object contains the following streams:
- `agency`
- `stops`
- `routes`
- `trips`
- `stop_times`
- `calendar_dates`
- `feed_info`

### CLI

```shell
build-mav-gtfs start-date end-date directory
build-mav-gtfs 01.12.2017 31.05.2018 ~/cp-gtfs
```

## To do

- minify/optimize gtfs `calendar_dates` to `calendar`

[@juliuste](https://github.com/juliuste) will be working on this the next few days.

## See also

- [mav](https://github.com/juliuste/mav) - Magyar Államvasutak API client in JavaScript
- [build-cp-gtfs](https://github.com/juliuste/build-cp-gtfs) - Build GTFS from the Comboios de Portugal (CP, Portugese Railways) REST API
- [db-api-to-gtfs](https://github.com/patrickbr/db-api-to-gtfs) - Build GTFS from the Deutsche Bahn (DB, German Railways) REST API

## Contributing

If you found a bug, want to propose a feature or feel the urge to complain about your life, feel free to visit [the issues page](https://github.com/juliuste/build-mav-gtfs/issues).
