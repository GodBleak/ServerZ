const Parser = require("config/parser")

Parser.setParser("boolean", (filename, content) => {
  return /^true$/i.test(String(content).trim())
})

module.exports = Parser
