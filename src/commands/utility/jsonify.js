const { AttachmentBuilder, SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const fsPromises = require('fs/promises')
const path = require('path');

const { Submission } = require("../../mongo/mongoModels").modelData;

module.exports = {
	data: new SlashCommandBuilder()
		.setName("jsonify")
		.setDescription("Provides a json-converted version of the submission database.")
		.setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
		.addBooleanOption(optionBuilder => optionBuilder
			.setName("ephemeral")
			.setRequired(false)
			.setDescription("Whether or not the response will be visible to other users.")
		),
	async execute(interaction) {
		const ephemeral = interaction.options.getBoolean("ephemeral", false) ?? false;
		await interaction.deferReply({ephemeral: ephemeral});

		const submissionDocs = await Submission.enqueue(() => Submission.find({}).exec());
		const jsonData = JSON.stringify(submissionDocs);
		
		const filepath = path.join(__dirname, 'jsonFiles', `export-${interaction.createdTimestamp}.json`);
		await fsPromises.writeFile(filepath, jsonData);

		const jsonAttachment = new AttachmentBuilder()
			.setFile(filepath)
			.setName(`Submissions@${interaction.createdTimestamp}.json`)
			.setDescription("A json-converted version of the submission database.");
		await interaction.editReply({files: [jsonAttachment]});

		await fsPromises.unlink(filepath);
	}
}