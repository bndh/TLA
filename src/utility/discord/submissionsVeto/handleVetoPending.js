const {time, TimestampStyles} = require("discord.js");

const { Submission } = require("../../../mongo/mongoModels").modelData;

const handleVetoJudgement = require("./handleVetoJudgement");
const { pendingThreads } = require("../../../commands/submissions/sync");

module.exports = async (channel, pendingTagId, message, videoLink) => {
	const handlingPromises = new Array(3);
	
	const expirationTime = new Date().valueOf() + (+process.env.PENDING_DURATION);
	handlingPromises[0] = Submission.enqueue(() => Submission.updateOne({threadId: channel.id}, {status: "PENDING APPROVAL", expirationTime: expirationTime}).exec());
	
	handlingPromises[1] = channel.setAppliedTags([pendingTagId]);
	
	const expirationDate = new Date(expirationTime); // 1 week in the future
	handlingPromises[2] = message.edit(`‼️ **Last Chance!** Pending Status expires ${time(expirationDate, TimestampStyles.RelativeTime)}...\n\n${videoLink}`);

	setTimeout(() => handleVetoJudgement(channel.client, channel.id), +process.env.PENDING_DURATION);
	pendingThreads.add(channel.id);

	return Promise.all(handlingPromises);
}
