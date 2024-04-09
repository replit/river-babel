import { serializeService } from "@replit/river";
import { serviceDefs } from "./serviceDefs";
import fs from "fs";

const schema = JSON.stringify(Object.values(serviceDefs).map(serializeService), null, 2)
fs.writeFileSync("schema.json", schema)
console.log('done dumping schema')