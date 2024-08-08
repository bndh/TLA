module.exports = async (message, userId, reactionCodes) => {
	let foundUserReaction = false;

	for(const reactionCode of reactionCodes) {
		const reaction = message.reactions.resolve(reactionCode);
		if(!reaction) continue;

		const fetchedUsers = await reaction.users.fetch();
		if(fetchedUsers.hasAny(...[userId])) {
			foundUserReaction = true;
			break;
		}
	}
	return foundUserReaction;
}