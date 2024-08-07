module.exports = async (message, reactionCodes) => {
	return reactionCodes.map(reactionCode => message.reactions.resolve(reactionCode)?.count)	 
}