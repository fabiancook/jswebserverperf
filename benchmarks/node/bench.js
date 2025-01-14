import {
    readdirSync,
    mkdirSync,
    existsSync,
    writeFileSync,
    appendFileSync,
    readFileSync
} from 'fs'
import rimraf from 'rimraf'
import { $ } from 'zx'
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import systeminfo from "../systeminfo.js";
const __dirname = dirname(fileURLToPath(import.meta.url));
const resultsPath = '/var/results/node';
let frameworks = JSON.parse(readFileSync(__dirname+'/frameworks.json', 'utf-8'))


const commands = [
    `bombardier --fasthttp -c 500 -d 10s http://localhost:3000/`,
    `bombardier --fasthttp -c 500 -d 10s http://localhost:3000/id/1?name=bun`,
    `bombardier --fasthttp -c 500 -d 10s -m POST -H 'Content-Type: application/json' -f ${__dirname}/../body.json http://localhost:3000/json`
]

const catchNumber = /Reqs\/sec\s+(\d+[.|,]\d+)/m
const format = Intl.NumberFormat('en-US').format


if (existsSync(resultsPath + '/')) rimraf.sync(resultsPath + '/')
mkdirSync(resultsPath + '/', {recursive: true})

const sleep = (s = 1) => new Promise((resolve) => setTimeout(resolve, s * 1000))

writeFileSync(
    resultsPath +'/results.md',
    `
|  Framework       |  Get (/)    |  Params, query & header | Post JSON  |
| ---------------- | ----------- | ----------------------- | ---------- |
`
)
const versions = JSON.parse((await $`npm ls --json`.quiet()).stdout);
const nodeVersion = ((await $`node --version`.quiet())+'').trim();
frameworks = frameworks.sort((a,b) => a.name.localeCompare(b.name));
versions.dependencies['Node'] = {version: nodeVersion};
let jsonResults = {};
for (const framework of frameworks) {
    let frameWorkResult = [];
    let name = framework.name;
    let npmVersion = versions.dependencies[framework.npmName]?.version ?? 'unknown';


    console.log(`\n${name}: ${framework.npmName}@${npmVersion}\n`)


    writeFileSync(resultsPath+`/${name}.txt`, '')
    appendFileSync(resultsPath+'/results.md', `| ${framework.npmName}@${npmVersion} `)

    const server = $`ENV=production node ${__dirname}/${framework.entryPoint}`.quiet().nothrow()

    // Wait 5 second for server to bootup
    await sleep(5)

    for (const command of commands) {
        appendFileSync(resultsPath +`/${name}.txt`, `${command}\n`)

        const results = (await $([command])) + ''


        appendFileSync(resultsPath +`/${name}.txt`, results + '\n')
        appendFileSync(
            resultsPath +'/results.md',
            `| ${format(catchNumber.exec(results)[1])} `
        )
        frameWorkResult.push(Number((catchNumber.exec(results)[1])));
    }
    jsonResults[framework.npmName] = {
        version: npmVersion,
        results: frameWorkResult
    };
    appendFileSync(resultsPath+'/results.md', `|\n`)

    await server.kill()
}


appendFileSync(
    resultsPath +'/results.md',
    `
    
    
    
|  SystemInfo       |  Value |
| ----------------  | ---------- |
`
)

systeminfo['runtime'] = `node ${nodeVersion}`;
systeminfo['date'] = (new Date()).toUTCString();


for(let k in systeminfo) {
    appendFileSync(
        resultsPath +'/results.md',
        `| ${k} | ${systeminfo[k]} |
`
    )
}

writeFileSync(resultsPath +'/results.json', JSON.stringify({
                                                               systeminfo,
                                                               results: jsonResults
                                                           }));
