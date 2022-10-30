Decrypts and copies into a new directory `decrypted_video` an already-downloaded HLS level manifest with some or all fragments encrypted by AES-128 encryption.

To download and decrypt a remote manifest, try alkerway/copyhls.

Usage: `node decrypt-manifest.js level.m3u8`

Decryption function for one frag here:

```js
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
```