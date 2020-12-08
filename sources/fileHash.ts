import * as crypto from "crypto";
import * as fs from "fs";

export default function fileHash(filename, algorithm = 'sha256'): Promise<string> {
  return new Promise((resolve, reject) => {
    const shasum = crypto.createHash(algorithm);
    try {
      let s = fs.createReadStream(filename)
      s.on('data', function (data) {
        shasum.update(data)
      })
      s.on('end', function () {
        const hash = shasum.digest('hex')
        return resolve(hash);
      })
    } catch (error) {
      return reject('calc fail');
    }
  });
}
