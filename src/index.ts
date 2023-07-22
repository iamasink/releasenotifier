import axios from 'axios'
import { exec } from 'child_process'
import * as fs from 'node:fs';

const wanted = {
    customFormats: ["Dubs Only", "Dual Audio"],
    language: "eng",
    score: -1,
    qualities: []
}

const sonarrurl = process.env.SONARRURL + "/api/v3"
const apikey = process.env.APIKEY
const notifyUrl = process.env.NOTIFYURL


console.log(`sonarrurl = ${sonarrurl}`)
console.log(`apikey = ${apikey}`)
console.log(`notifyUrl = ${notifyUrl}`)

// check if all env variables are set
if (sonarrurl === undefined) {
    console.error("SONARRURL is not set")
    process.exit(1)
}
if (apikey === undefined) {
    console.error("APIKEY is not set")
    process.exit(1)
}
if (notifyUrl === undefined) {
    console.error("NOTIFYURL is not set")
    process.exit(1)
}

/*
get episode list every x minutes
save all episodefiles to disk
if new releases contain the wanted formats and the old ones dont, send a notification
*/

async function getData() {
    // if json data file doesn't exist, create it
    if (!fs.existsSync('data.json')) {
        fs.writeFileSync('data.json', '{}')
    }
    // read json data file
    const data = JSON.parse(fs.readFileSync('data.json', 'utf8') || "{}")
    // console.log(data)



    const series: any[] = (await axios.get(`${sonarrurl}/series?apikey=${apikey}`)).data
    const newepisodes: any[] = []

    // for all series, get all episodes, and for all episodes, get the episodefile.
    for (let i = 0, len = series.length; i < len; i++) {
        const serie = series[i]
        console.log(serie)
        const episodes = (await axios.get(`${sonarrurl}/episode?seriesId=${serie.id}&apikey=${apikey}`)).data
        for (let i = 0, len = episodes.length; i < len; i++) {
            const episode = episodes[i]
            // console.log(episode)
            if (!episode.hasFile) continue
            const episodefile = (await axios.get(`${sonarrurl}/episodefile/${episode.episodeFileId}?apikey=${apikey}`)).data
            // console.log(episodefile)
            // if episodefile has wanted audio language, notify
            console.log(episodefile.mediaInfo.audioLanguages.split('/'))
            // console.log(episode)

            if (episodefile.mediaInfo.audioLanguages.split('/').includes(wanted.language)) {
                console.log("found wanted language")
                if (((data[episode.episodeFileId] !== undefined && !data[episode.episodeFileId].mediaInfo.audioLanguages.split('/').includes(wanted.language)))) {
                    console.log("new episode")
                    newepisodes.push(episode)
                }
                else if (data[episode.episodeFileId] === undefined) {
                    console.log("entirely new episode, dont notify because idk")
                }
                else {
                    console.log("old episode had it already")
                }
            } else {
                console.log("didnt find wanted language")
            }

            // save episodefile to data
            data[episode.episodeFileId] = episodefile

        }
    }

    // loop through new episodes and notify per series, with the season number and episode numbers.
    let notifytexts = []

    const seriesepisodes: any = {}
    for (let i = 0, len = newepisodes.length; i < len; i++) {
        const episode = newepisodes[i]
        if (seriesepisodes[episode.seriesId] === undefined) {
            seriesepisodes[episode.seriesId] = []
        }
        seriesepisodes[episode.seriesId].push(episode)
    }
    console.log(seriesepisodes)
    for (const seriesId in seriesepisodes) {
        const episodes = seriesepisodes[seriesId]
        const serie = series.find(serie => serie.id == seriesId)
        const season = episodes[0].seasonNumber
        const episodesnumbers = episodes.map(episode => episode.episodeNumber.toString().padStart(2, '0'))
        const episodesnumbersstring = episodesnumbers.join(', E')
        const text = `${serie.title} S${season.toString().padStart(2, '0')}: E${episodesnumbersstring}`
        console.log(text)
        notifytexts.push(text)
    }

    if (notifytexts.length > 0) {
        notify(notifytexts.join('\n'))
    }

    // save data to json file
    const jsonData: string = JSON.stringify(data, null, 2);
    fs.writeFile("data.json", jsonData, 'utf8', (err) => {
        if (err) {
            console.error('Error writing to file:', err);
        } else {
            console.log('Data has been written to the file successfully!');
        }
    });

}

async function notify(text: string) {
    const dryrun = false
    const title = "New episode released!"
    const body = text

    // notify with apprise
    // apprise 
    console.log("notify!")
    console.log(body)
    if (dryrun) return
    exec(`apprise -vv -t "${title}" -b "${body}" ${notifyUrl}`, (error, stdout, stderr) => {
        if (error) {
            console.log(`error: ${error.message}`);
            if (error.message.includes('command not found') || error.message.includes('not recognized')) {
                console.info('Run `pip install apprise`.');
            }
        }
        if (stderr) console.error(`stderr: ${stderr}`);
        if (stdout) console.log(`stdout: ${stdout}`);
    });
}


// notify()

// run getData() every 30 minutes
getData()
setInterval(getData, 1000 * 60 * 30)

// notify("test with spaces")