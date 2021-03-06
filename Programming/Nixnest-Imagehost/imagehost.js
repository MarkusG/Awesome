var domain = 'nixne.st'
var port = '1680'
var root = '/home/zack/image-host'

var express = require('express');
var cors = require('cors');
var path = require('path');
var fs = require('fs');
var app = express();
var atob = require('atob');
var crypto = require('crypto');
var fileUpload = require('express-fileupload')
var schedule = require('node-schedule');
var rimraf = require('rimraf');

/** set file size limit */
app.use(express.json({limit: '50mb'}));
app.use(cors());
app.use(fileUpload())
app.enable('trust proxy')
/**
 * initialize public screenshot directory purge job
 * this deletes every file in there if it's older than 10 days
 */
var pubClean = schedule.scheduleJob(' 0 * * * *', function() {
    var pubDir = root + '/images/i/'

    /** read public directory, for every file do */
    fs.readdir(pubDir, function (err, files) {
        files.forEach(function(file, index) {
            fs.stat(path.join(pubDir, file), function (err, stat) {
                var endTime, now;
                if (err) {
                    return console.error(err);
                }
                now = new Date().getTime();
                endTime = new Date(stat.ctime).getTime() + 864000; // 864000s = 10d
                /** if the file is older than 10 days */
                if (now > endTime) {
                    /** delete file */
                    return rimraf(path.join(pubDir, file), function(err){
                        if (err) {
                            return console.error(err);
                        }
                        console.log('Cleaned up the public folder')
                    })
                }
            })
        })
    })
});

app.get('/*', function (req, res) {
    var host = req.headers.host
    var sub = host.split(".")[0]
    res.contentType('image/png')
    res.sendFile(root + '/images/' + sub + req.url)
});

/** user posts to $domain/image */
app.post('/image', function (req, res) {
    /** which users are allowed to post? load them */
    var users = require('./users.json')

    /** request didn't post a file */
    if(!req.files.uploadFile) {
        res.status(500).send({ error: 'No file uploaded'})
        return;
    }

    if(!req.headers[`upload-key`]) {
        var key = 'i'
    } else {
        var key = req.headers[`upload-key`];
    }

    /** request contained incorrect key */
    if(!users.hasOwnProperty(key)){
        res.status(500).send({ error: 'incorrect key' });
        console.log("incorrect key")
        return;
    }

    /** not an image / unsupported image */
    if (req.files.uploadFile.mimetype.indexOf('image/') <= -1) {
        res.status(500).send({error: 'File format not supported'})
        return;
    }

    /** does the image directory exist? */
    var dir = './images/' + users[key].dir
    if (!fs.existsSync(dir)) fs.mkdirSync(dir);

    /** load image from request */
    imgData = req.files.uploadFile.data;

    /**
     * generate filename from request image by
     * - hashing the image binary
     * - encoding it as base16
     * - then using the first 6 characters
     * - adding a file extension
     */
    var fileName = crypto
        .createHash("sha512")
        .update(imgData, "binary")
        .digest("hex")
        .substring(0,6) + path.extname(req.files.uploadFile.name)

    var finalPath = dir + '/' + fileName

    /** generate image url */
    var url  = 'https://' + users[key].dir + '.' + domain + '/' + fileName

    fs.appendFile('log.txt', req.ip + ' Uploads ' + finalPath + "\n", function (err) {
        if (err) throw err;
            console.log(req.ip + ' Uploads ' + finalPath)
        })

    /** write file to servers filesystem */
    fs.writeFile(finalPath, imgData, (err) => {
        // if something went wrong
        // (server ran out of space, write perms missing, ...)
        if (err) {
            res.status(500).send({error: 'Something went wrong. Try again'})
            throw err
        }
        res.status(200).send({link: url})
        delete(users)
    })
});
app.listen(port)
console.log('Ready.')
