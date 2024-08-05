const { SlashCommandBuilder } = require("discord.js");
const Judge = require("../../mongo/Judge");

module.exports = {
	data: new SlashCommandBuilder()
		.setName("random")
		.setDescription("Fetch a random submission which you have not yet judged."),
	async execute(interaction) {
		const deferPromise = interaction.deferReply({ephemeral: true});

		const judgeEntry = await Judge.enqueue(() => Judge.findOne({userId: interaction.user.id}).select({unjudgedThreadIds: 1, _id: 0}));
		const layoutThreadIds = judgeEntry.unjudgedThreadIds;
		const randomThreadId = layoutThreadIds[Math.floor(Math.random() * layoutThreadIds.length)];
		const threadLink = (await interaction.client.channels.fetch(randomThreadId)).url;
		
		await deferPromise;
		interaction.editReply(`Found unjudged layout at: ${threadLink}`);
	}
};