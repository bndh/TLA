const {Collection, Events, PermissionFlagsBits, EmbedBuilder} = require("discord.js");
const turnPage = require("../utility/discord/buttons/audit/helperModules/turnPage");
const search = require("../utility/discord/buttons/audit/search");
const getAllExports = require("../utility/files/getAllExports");
const path = require("path");

let buttons;

	buttons = new Collection();
	const buttonData = getAllExports(path.join(__dirname, "..", "utility/discord/buttons"), file => !file.name.toLowerCase().endsWith("modules"));
	buttonData.forEach(button => buttons.set(button.customId, button));



module.exports = {
	name: Events.InteractionCreate,
	async execute(interaction) {
		if(interaction.isChatInputCommand()) handleChatInputCommand(interaction);
		if(interaction.isButton()) handleButtonInteraction(interaction);
	}
};

async function handleChatInputCommand(interaction) {
	const command = interaction.client.commands.get(interaction.commandName); // The client instance provided by interaction is the same as the client defined earlier
	if(!command) {
		console.error(`No command matching ${interaction.commandName} was found.`);
		return;
	}

	try {
		await command.execute(interaction);
	} catch(error) {
		console.error(error);
		if(interaction.replied || interaction.deferred) {
			interaction.editReply({
				embeds: [new EmbedBuilder()
					.setDescription("An **error occurred**; please try again.\nIf the **problem persists**, please contact _**@gamingpharoah**_.")
					.setAuthor({name: "TLA Admin Team", iconURL: process.env.EXTREME_DEMON_URL, url: "https://www.youtube.com/@bndh4409"})
					.setColor(process.env.FAIL_COLOR)]
			});
		} else {
			interaction.reply({
				embeds: [new EmbedBuilder()
					.setDescription("An **error occurred**; please try again.\nIf the **problem persists**, please contact _**@gamingpharoah**_.")
					.setAuthor({name: "TLA Admin Team", iconURL: process.env.EXTREME_DEMON_URL, url: "https://www.youtube.com/@bndh4409"})
					.setColor(process.env.FAIL_COLOR)], 
				ephemeral: true
			});
		}
	}
}

async function handleButtonInteraction(interaction) {
	const button = buttons.get(interaction.customId);
	if(!button) interaction.reply({
		ephemeral: true,
		embeds: [new EmbedBuilder()
				.setAuthor({name: "Something went wrong!", iconURL: process.env.EXTREME_DEMON_URL})
				.setDescription("That button is **missing implementation**!\nIf you believe this is **incorrect**, please contact _**@gamingpharoah**_.")
				.setColor(process.env.FAIL_COLOR)]
	});

	if(interaction.memberPermissions.has(button.permissionBits)) {
		try {
			await button.execute(interaction);
		} catch(error) {
			console.error(error);
			if(interaction.replied || interaction.deferred) {
				interaction.editReply({
					embeds: [new EmbedBuilder()
						.setDescription("An **error occurred**; please try again.\nIf the **problem persists**, please contact _**@gamingpharoah**_.")
						.setAuthor({name: "TLA Admin Team", iconURL: process.env.EXTREME_DEMON_URL, url: "https://www.youtube.com/@bndh4409"})
						.setColor(process.env.FAIL_COLOR)]
				});
			} else {
				interaction.reply({
					embeds: [new EmbedBuilder()
						.setDescription("An **error occurred**; please try again.\nIf the **problem persists**, please contact _**@gamingpharoah**_.")
						.setAuthor({name: "TLA Admin Team", iconURL: process.env.EXTREME_DEMON_URL, url: "https://www.youtube.com/@bndh4409"})
						.setColor(process.env.FAIL_COLOR)], 
					ephemeral: true
				});
			}
		}
	} else {
		if(interaction.replied || interaction.deferred) {
			interaction.editReply({
				embeds: [new EmbedBuilder()
					.setDescription("**Insufficient permissions**!\nIf you believe this is **incorrect**, please contact _**@gamingpharoah**_.")
					.setAuthor({name: "TLA Admin Team", iconURL: process.env.EXTREME_DEMON_URL, url: "https://www.youtube.com/@bndh4409"})
					.setColor(process.env.FAIL_COLOR)]
			});
		} else {
			interaction.reply({
				embeds: [new EmbedBuilder()
					.setDescription("**Insufficient permissions**!\nIf you believe this is **incorrect**, please contact _**@gamingpharoah**_.")
					.setAuthor({name: "TLA Admin Team", iconURL: process.env.EXTREME_DEMON_URL, url: "https://www.youtube.com/@bndh4409"})
					.setColor(process.env.FAIL_COLOR)], 
				ephemeral: true
			});
		}
	}
} // TODO test composite permissions