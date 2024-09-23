require("dotenv").config();
const Auditee = require("../../../../mongo/Auditee");
const { generateJudgeTableBlock } = require("../../../../commands/audits/audit");
const { EmbedBuilder } = require("discord.js");

module.exports = async (interaction) => {
	const deferPromise = interaction.deferReply({ephemeral: true});



	const auditee = await Auditee.findOne({userId: interaction.user.id}).exec();
	if(!auditee) {
		await deferPromise;
		interaction.editReply({embeds: [generateNotFoundEmbed()]});
		return;
	}   

	const auditeeBlockPromise = new Promise(async resolve => {
		const index = await Auditee.countDocuments({judgedInInterim: {$lt: auditee.judgedInInterim}}).exec();
		resolve(await generateJudgeTableBlock(interaction.client, [auditee], index, 1));
	});
	const userPromise = interaction.client.users.fetch(interaction.user.id);
	const performanceEmbedArguments = await Promise.all([auditeeBlockPromise, userPromise]);

	await deferPromise;
	interaction.editReply({
		embeds: [generatePerformanceEmbed(...performanceEmbedArguments)]
	});
};

function generatePerformanceEmbed(auditeeBlock, user) {
	return new EmbedBuilder()
		.setDescription(`**${auditeeBlock}**`)
		.setAuthor({name: `${user.displayName}'s Performance Report`, iconURL: `https://cdn.discordapp.com/avatars/${user.id}/"${user.avatar}.jpeg`})
		.setColor(process.env.SUCCESS_COLOR);
}

function generateNotFoundEmbed() {
	return new EmbedBuilder()
		.setDescription("Your information was **not recorded** in an **Audit Report**!\nIf you believe this is **incorrect**, please contact _**@gamingpharoah**_")
		.setAuthor({name: "TLA Admin Team", iconURL: process.env.EXTREME_DEMON_URL})
		.setColor(process.env.FAIL_COLOR);
}