import { serializeSchema } from "@replit/river";
import { serviceDefs } from "./serviceDefs";
import fs from "fs";

const schema = JSON.stringify(serializeSchema(serviceDefs), null, 2);
fs.writeFileSync("schema.json", schema);
console.log("done dumping schema");
