const fs = require('node:fs')
const downsize = require('thumbsup-downsize')

exports.createMap = function (opts) {
  const thumbSize = opts.thumbSize || 120
  const smallSize = opts.smallSize || 300
  const largeSize = opts.largeSize || 1000
  const defaultOptions = {
    quality: opts.photoQuality,
    args: opts.gmArgs
  }
  const watermarkDefault = {
    file: opts.watermark,
    position: opts.watermarkPosition
  }
  const watermark = (!opts.watermark) ? null : watermarkDefault
  const seek = opts.videoStills === 'middle' ? -1 : opts.videoStillsSeek
  const thumbnail = Object.assign({}, defaultOptions, {
    height: thumbSize,
    width: thumbSize,
    seek
  })
  const small = Object.assign({}, defaultOptions, {
    height: smallSize,
    seek
  })
  const large = Object.assign({}, defaultOptions, {
    height: largeSize,
    watermark,
    animated: true,
    seek
  })
  const videoOpts = {
    format: opts.videoFormat,
    quality: opts.videoQuality,
    bitrate: opts.videoBitrate,
    hwaccel: opts.videoHwaccel
  }
  return {
    'fs:copy': (task, done) => fs.copyFile(task.src, task.dest, done),
    'fs:symlink': (task, done) => fs.symlink(task.src, task.dest, done),
    'photo:thumbnail': (task, done) => downsize.image(task.src, task.dest, thumbnail, done),
    'photo:small': (task, done) => downsize.image(task.src, task.dest, small, done),
    'photo:large': (task, done) => downsize.image(task.src, task.dest, large, done),
    'video:thumbnail': (task, done) => downsize.still(task.src, task.dest, thumbnail, done),
    'video:small': (task, done) => downsize.still(task.src, task.dest, small, done),
    'video:poster': (task, done) => downsize.still(task.src, task.dest, large, done),
    'video:resized': (task, done) => downsize.video(task.src, task.dest, videoOpts, done)
  }
}
