require("dotenv").config();
const Auditee = require("../../../../mongo/Auditee");
const { generateJudgeTableBlock } = require("../../../../commands/audits/audit");
const { EmbedBuilder, PermissionFlagsBits } = require("discord.js");

module.exports = {
	customId: "search",
	async execute(interaction) {
		await interaction.deferUpdate();
	
		const auditee = await Auditee.findOne({userId: interaction.user.id}).exec();
		if(!auditee) {
			interaction.followUp({embeds: [generateNotFoundEmbed()]});
			return;
		}   
	
		const auditeeBlockPromise = new Promise(async resolve => {
			const index = await Auditee.countDocuments({judgedInInterim: {$lt: auditee.judgedInInterim}}).exec();
			resolve(await generateJudgeTableBlock(interaction.client, [auditee], index, 1));
		});
		const userPromise = interaction.client.users.fetch(interaction.user.id);
		const performanceEmbedArguments = await Promise.all([auditeeBlockPromise, userPromise]);
	
		interaction.followUp({
			embeds: [generatePerformanceEmbed(...performanceEmbedArguments)],
			ephemeral: true
		});
	}
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