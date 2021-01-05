"use strict"
let azure = require('azure-storage'),
    path = require('path'),
    uuid = require('node-uuid')

let _requestsQueue = []

const blobName = (file, req) => {

    var user_id = req.body.user_id
        var story = req.body.story
        var type = req.body.type
        var storyId = req.body.story_id

        if (type == "") type = "image";
        if (type == "image") {
            if (story == "1") {
                return "chat/image/" + Date.now() + user_id + "_story_" + storyId + path.extname(file.originalname);
            } else {
                return "chat/image/" + Date.now() + user_id + path.extname(file.originalname);
            }
        }
        return "ok";
}

const defaultSecurity = 'blob'

class MulterAzureStorage {

    constructor(opts) {
        this.containerCreated = false
        this.containerError = false

        let azureUseConnectionString

        let missingParameters = []

        if (!opts.azureStorageConnectionString) {
            azureUseConnectionString = false;
            if (!opts.azureStorageAccessKey) missingParameters.push("azureStorageAccessKey")
            if (!opts.azureStorageAccount) missingParameters.push("azureStorageAccount")
        } else {
            azureUseConnectionString = true;
        }

        if (!opts.containerName) missingParameters.push("containerName")


        if (missingParameters.length > 0) {
            throw new Error('Missing required parameter' + (missingParameters.length > 1 ? 's' : '') + ' from the options of MulterAzureStorage: ' + missingParameters.join(', '))
        }

        this.containerName = opts.containerName

        this.fileName = opts.fileName

        if (azureUseConnectionString) {
            this.blobService = azure.createBlobService(opts.azureStorageConnectionString)
        } else {
            this.blobService = azure.createBlobService(
                opts.azureStorageAccount,
                opts.azureStorageAccessKey)
        }

        let security = opts.containerSecurity || defaultSecurity

        this.blobService.createContainerIfNotExists(this.containerName, { publicAccessLevel: security }, (err, result, response) => {
            if (err) {
                this.containerError = true
                throw new Error('Cannot use container. Check if provided options are correct.')
            }

            this.containerCreated = true

            _requestsQueue.forEach(i => this._removeFile(i.req, i.file, i.cb))
            _requestsQueue = []
        })
    }

    _handleFile(req, file, cb) {
        if (this.containerError) {
            cb(new Error('Cannot use container. Check if provided options are correct.'))
        }

        if (!this.containerCreated) {
            _requestsQueue.push({ req: req, file: file, cb: cb })
            return
        }


        const blob = blobName(file, req);

        file.stream.pipe(this.blobService.createWriteStreamToBlockBlob(
            this.containerName,
            blob,
            /* options - see https://azure.github.io/azure-storage-node/BlobService.html#createWriteStreamToBlockBlob__anchor */
            {
                contentSettings: { contentType: file.mimetype }
            },
            (err, azureBlob) => {
                if (err) {
                    return cb(err)
                }

                this.blobService.getBlobProperties(this.containerName, blob, (err, result, response) => {
                    if (err) {
                        return cb(err)
                    }

                    const url = this.blobService.getUrl(this.containerName, blob)
                    cb(null, {
                        container: result.container,
                        blob: blob,
                        blobType: result.blobType,
                        size: result.contentLength,
                        etag: result.etag,
                        metadata: result.metadata,
                        url: url
                    })
                })
            }))
    }

    _removeFile(req, file, cb) {
        if (this.containerError) {
            cb(new Error('Cannot use container. Check if provided options are correct.'))
        }

        if (file.blobName) {
            this.blobService.deleteBlob(this.containerName, file.blobName, cb)
        } else {
            cb(null)
        }
    }
}

/**
 * @param {object}      [opts]
 * @param {string}      [opts.azureStorageConnectionString]
 * @param {string}      [opts.azureStorageAccessKey]
 * @param {string}      [opts.azureStorageAccount]
 * @param {string}      [opts.containerName]
 * @param {string}      [opts.containerSecurity]                'blob' or 'container', default: blob
 * @param {function}    [opts.fileName]     function that given a file will return the name to be used as the file's name
 */
module.exports = function (opts) {
    return new MulterAzureStorage(opts)
}
