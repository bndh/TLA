const { SlashCommandBuilder } = require("discord.js");
const Judge = require("../../mongo/Judge");

module.exports = {
	data: new SlashCommandBuilder()
		.setName("random")
		.setDescription("Fetch a random submission which you have not yet judged."),
	async execute(interaction) {
		const deferPromise = interaction.deferReply({ephemeral: true});

		const judgeEntry = await Judge.enqueue(() => {
			Judge.findOne({userId: interaction.user.id})
				 .select({unjudgedThreadIds: 1, _id: 0})
		 		 .exec()
		});
		if(!judgeEntry) {
			await deferPromise;
			interaction.editReply(`You are not yet \`registered\`. Contact an \`admin\` if you believe this is incorrect.`);
			return;
		}

		const unjudgedThreadIds = judgeEntry.unjudgedThreadIds;
		const randomUnjudgedId = unjudgedThreadIds[Math.floor(Math.random() * unjudgedThreadIds.length)];
		const thread = await interaction.client.channels.fetch(randomUnjudgedId);
		
		await deferPromise;
		interaction.editReply(`Found unjudged layout at: ${thread.url}!`);
	}
};