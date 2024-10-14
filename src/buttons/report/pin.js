const { Info } = require("../../mongo/mongoModels").modelData;

const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require("discord.js");

const calibrateButtonRow = require("../../utility/discord/messages/calibrateButtonRow");

module.exports = {
	data: new ButtonBuilder()
		.setCustomId("pin")
		.setLabel("Pin")
		.setEmoji("📌")
		.setStyle(ButtonStyle.Primary),
	async execute(interaction) {
		await interaction.deferUpdate();

		const thread = interaction.channel;

		const pinnedData = await Info.enqueue(() => Info.findOne({id: "pinnedReportId"})
										  			  .select({data: 1})
										  			  .exec());
		const pinnedId = pinnedData ? pinnedData.data : undefined;
		if(pinnedId) {
			try {
				const pinnedThread = await thread.parent.threads.fetch(pinnedId);
				
				await Promise.all([
					pinnedThread.unpin(),
					new Promise(async resolve => {
						const starterMessage = await pinnedThread.fetchStarterMessage();
						const enabledPinButtonRow = calibrateButtonRow(
							starterMessage.components[0],
							buttonBuilder => buttonBuilder.data.custom_id === "pin",
							() => true
						);
						
						await starterMessage.edit({components: [enabledPinButtonRow]});
						resolve();
					})
				]);
			} catch(notFound) {}
		}

		await Promise.all([
			thread.pin(),
			Info.enqueue(() => {
				if(pinnedId) return Info.updateOne({id: "pinnedReportId", data: thread.id}).exec();
				return Info.create({id: "pinnedReportId", data: thread.id});
			})
		]);

		const calibratedActionRow = calibrateButtonRow(
			interaction.message.components[0],
			buttonBuilder => buttonBuilder.data.custom_id === "pin",
			() => false
		);

		await Promise.all([
			interaction.followUp({
				embeds: [EmbedBuilder.generateSuccessEmbed("Successfully **pinned** this report!")],
				ephemeral: true
			}),
			interaction.editReply({components: [calibratedActionRow]})
		]);
	}
};