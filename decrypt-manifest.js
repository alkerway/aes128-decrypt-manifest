const crypto = require('crypto')
const fs = require('fs')

const commandLineArgs = process.argv.slice(2);
const levelPath = commandLineArgs[0]
if (!fs.existsSync(levelPath)) {
    console.log('No valid manifest')
    process.exit(1)
}

const outputDirectory = 'decrypted_video'
const manifestContents = fs.readFileSync(levelPath, 'utf8')
const manifestLines = manifestContents.split('\n')
if (!fs.existsSync(outputDirectory)) {
    fs.mkdirSync(outputDirectory)
} else {
    fs.rmSync(outputDirectory, { recursive: true })
    fs.mkdirSync(outputDirectory)
}

let currentKeyFilePath = null
let currentDefinedIV = null
let currentMediaSequence = -1
let newManifestLines = []
const fragsToCopy = []
manifestLines.forEach((line, idx) => {
    if (line.startsWith('##' || !line)) {
        newManifestLines.push(line)
    } else if (line.startsWith('#')) {
        if (line.startsWith('#EXT-X-MEDIA-SEQUENCE')) {
            const mediaSequence = Number(line.slice('#EXT-X-MEDIA-SEQUENCE:'.length))
            currentMediaSequence = mediaSequence || 0
        }
        if (line.startsWith('#EXT-X-KEY')) {
            const tagContents = line.slice('#EXT-X-KEY:'.length)
            const attributes = tagContents.split(/(?!\B"[^"]*),(?![^"]*"\B)/g)
                .reduce((attributesObj, attribute) => {
                    const [key, val] = attribute.split(/=(.*)/g)
                    const valNoQuotes = val.startsWith('"') ?
                        val.substring(1, val.length - 1) :
                        val
                    attributesObj[key] = valNoQuotes
                    return attributesObj
                }, {})
            if (attributes['METHOD'] === 'AES-128') {
                currentKeyFilePath = attributes['URI']
                if (attributes['IV']) {
                    currentDefinedIV = attributes['IV'].replace('0x', '')
                }
            } else if (attributes['METHOD'] === 'NONE') {
                currentKeyFilePath = null
                currentDefinedIV = null
            } else {
                console.log('Unsupported key line, abort')
                process.exit(1)
            }
        } else {
            newManifestLines.push(line)
        }
    } else {
        const lastPartOfPath = line.split('/').slice(-1)[0]
        const pathFromNewManifest = `clear_frags/${lastPartOfPath}`
        newManifestLines.push(pathFromNewManifest)

        const copyPath = `${outputDirectory}/${pathFromNewManifest}`
        let fragIv = currentDefinedIV
        if (!currentDefinedIV && currentKeyFilePath) {
            fragIv = currentMediaSequence.toString(16).padStart(32, 0)
        }
        if (!fragsToCopy.length) {
            fs.mkdirSync(`${outputDirectory}/clear_frags`)
        }
        fragsToCopy.push({
            oldPath: line,
            newPath: copyPath,
            keyPath: currentKeyFilePath,
            ivString: fragIv
        })
        currentMediaSequence += 1
    }
})

fs.writeFileSync(`${outputDirectory}/level.m3u8`, newManifestLines.join('\n'))


const decryptAndCopyFrag = async (fragPath, keyPath, IV, outputPath) => {
    return new Promise((resolve, reject) => {
        const keyBuffer = fs.readFileSync(keyPath);
        const readStream = fs.createReadStream(fragPath, { highWaterMark: 1 << 16 });
        const writeStream = fs.createWriteStream(outputPath)
        const decipher = crypto.createDecipheriv('aes-128-cbc', keyBuffer, Buffer.from(IV, 'hex')).setAutoPadding(false)
        writeStream.on('finish', resolve)
        writeStream.on('error', reject)
        readStream.on('error', reject)
        readStream.pipe(decipher).pipe(writeStream)
    })
}
const copyFrag = async (fragPath, outputPath) => {
    return new Promise((resolve, reject) => {
        const readStream = fs.createReadStream(fragPath, { highWaterMark: 1 << 16 });
        const writeStream = fs.createWriteStream(outputPath)
        writeStream.on('finish', resolve)
        writeStream.on('error', reject)
        readStream.on('error', reject)
        readStream.pipe(writeStream)
    })
}

const decryptAndCopyFrags = async (fragsToCopy) => {
    for (const frag of fragsToCopy) {
        if (frag.keyPath) {
            await decryptAndCopyFrag(frag.oldPath, frag.keyPath, frag.ivString, frag.newPath)
        } else {
            await copyFrag(frag.oldPath, frag.newPath)
        }
    }
}

decryptAndCopyFrags(fragsToCopy)
