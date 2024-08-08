require("dotenv").config();

module.exports = async (message, reactionCodes) => { // reactionCodes should be in ...[] format
	const users = [];

	for(const reactionCode of reactionCodes) {
		let reaction = message.reactions.resolve(reactionCode);
		
		const reactedUsers = await reaction.users.fetch();
		if(!reactedUsers) return;

		reactedUsers.each(user => {
			if(users.includes(user.id)) return;
			users.push(user.id);
		});
	}

	return users;
};