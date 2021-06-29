import {npath, PortablePath, ppath, xfs, ZipFS} from "@yarnpkg/fslib";

export default async function addFilesToZip(src: PortablePath, files: PortablePath[], outputZip: ZipFS) {
    for (const fileRequest of files) {
        const file = ppath.normalize(fileRequest);
        const source = ppath.resolve(src, file);

        const stat = await xfs.lstatPromise(source);

        if (stat.isFile()) {
            const content = await xfs.readFilePromise(source);
            await outputZip.writeFilePromise(file, content);
        } else if (stat.isSymbolicLink()) {
            const content = await xfs.readlinkPromise(source)
            await outputZip.symlinkPromise(content, file);
        } else {
            throw new Error(`Unsupported file type ${stat.mode} for ${npath.fromPortablePath(file)}`);
        }

        await outputZip.utimesPromise(file, 0, 0);
    }

    return outputZip;
}