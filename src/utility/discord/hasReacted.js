module.exports = async (message, userId, reactionCodes) => { // reactionCodes should be in ...[] format
	let foundUserReaction = false;

	for(const reactionCode of reactionCodes) {
		const reaction = message.reactions.resolve(reactionCode);
		if(!reaction) continue;

		const unfetchedUsers = reaction.users;
		const fetchedUsers = await unfetchedUsers.fetch();
		if(fetchedUsers.hasAny(...[userId])) {
			foundUserReaction = true;
			break;
		}
	}
	return foundUserReaction;
}