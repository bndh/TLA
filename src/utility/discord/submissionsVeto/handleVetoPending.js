const {time, TimestampStyles} = require("discord.js");

const { Submission } = require("../../../mongo/mongoModels").modelData;

const handleVetoJudgement = require("./handleVetoJudgement");
const { pendingThreads } = require("../../../commands/submissions/sync");

module.exports = async (channel, pendingTagId, message, videoLink) => {
	const expirationTime = new Date().valueOf() + (+process.env.PENDING_DURATION);
	Submission.enqueue(() => Submission.updateOne({threadId: channel.id}, {status: "PENDING APPROVAL", expirationTime: expirationTime}).exec());
	
	channel.setAppliedTags([pendingTagId]);
	
	const expirationDate = new Date(expirationTime); // 1 week in the future
	message.edit(`‼️ **Last Chance!** Pending Status expires ${time(expirationDate, TimestampStyles.RelativeTime)}...\n\n${videoLink}`);

	setTimeout(() => handleVetoJudgement(channel.client, channel.id), +process.env.PENDING_DURATION);
	pendingThreads.add(channel.id);
}
