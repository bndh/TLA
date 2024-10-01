module.exports = (message, reactionCodes) => {
	return reactionCodes.reduce((total, emojiCode) => {
		const reaction = message.reactions.resolve(emojiCode);
		return total + (reaction?.count ?? 0);
	}, 0);
}