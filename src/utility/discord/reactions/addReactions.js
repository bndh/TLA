module.exports = async (message, reactionCodes = ["✅", "⛔"]) => {
	const reactionPromises = Array(reactionCodes.length);
	for(let i = 0; i < reactionCodes.length; i++) {
		reactionPromises[i] = message.react(reactionCodes[i]);
	}
	return Promise.all(reactionPromises);
}