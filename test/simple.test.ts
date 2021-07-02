import * as util from "util";
import {PathLike, promises as fs} from "fs";
import cowsay from "cowsay";

const exec = util.promisify(require("child_process").exec);

async function clean() {
    await exec("rm -f test.zip", {cwd: "examples/simple"});
    await exec("rm -rf test/", {cwd: "examples/simple"});
}

beforeAll(clean);

afterAll(clean);

async function exists(path: PathLike) {
    try {
        await fs.stat("examples/simple/test.zip");
        return true;
    } catch(err) {
        return false;
    }
}

test("packages codebase", async () => {
    expect(await exists("examples/simple/test.zip")).toBe(false);

    const {stderr} = await exec("yarn packageLambda -o test.zip", { cwd: "examples/simple" });

    expect(stderr).toBe("");

    expect(await exists("examples/simple/test.zip")).toBe(true);

    await exec("unzip test.zip -d test", { cwd: "examples/simple" });

    const {stdout} = await exec("node index.js", { cwd: "examples/simple/test" })

    expect(stdout.trimEnd()).toEqual(cowsay.say({
        text: "Hello World!"
    }))
})
