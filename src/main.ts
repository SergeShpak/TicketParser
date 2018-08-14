import * as FS from 'fs'

import Parser from './parser/CheerioParser'

const fieldsOrder = 
  ["status", "result", "trips", "code", "name", "details", "price", "roundTrips",
  "departureTime", "departureStation", "arrivalTime", "arrivalStation", "type", "date",
  "trains", "number", "passengers", "type", "age", "custom", "prices", "value"];

(async () => {
  const contents = await ReadFile("test.html")
  const tidyContents = await TidyContents(contents)
  const p = new Parser()
  let parsedTicket
  try {
    parsedTicket = await p.Parse(tidyContents)
  }
  catch(e) {
    console.log("An error occurred during parsing:", e)
    return
  }
  const parsedTicketStr = JSON.stringify(parsedTicket, fieldsOrder, 2)
  await WriteToFile("my-result.json", parsedTicketStr)
})();

async function ReadFile(filePath: string): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    FS.readFile(filePath, (e: Error, data: Buffer) => {
      e ? reject(e) : resolve(data)
    })
  })
}

async function TidyContents(contents: Buffer): Promise<Buffer> {
  return new Promise<Buffer>((resolve) => {
    let contentsStr = contents.toString()
    let res = contentsStr.replace(/\\"/g, '"')
    return resolve(Buffer.from(res))
  })
}

async function WriteToFile(filePath: string, data: string) {
  return new Promise((resolve, reject) => {
    FS.writeFile(filePath, data, (e: Error) => {
      e ? reject(e) : resolve()
    })
  })
}