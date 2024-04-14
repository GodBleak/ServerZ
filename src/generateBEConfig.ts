import { config } from "./config.js";

export function generateBEConfig() {
  let file = "";

  if (config.battleye.ip) file += `RConIP ${config.battleye.ip}\n`;
  if (config.battleye.port) file += `RConPort ${config.battleye.port}\n`;
  if (config.battleye.password)
    file += `RConPassword ${config.battleye.password}\n`;

  return file !== "" ? file : null;
}
