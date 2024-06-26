module.exports = (message, reactions = ["✅", "⛔"]) => {
	reactions.forEach(reaction => message.react(reaction));
}