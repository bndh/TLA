const { Auditee } = require("../../../../../mongo/mongoModels").modelData;

const { generateJudgeTableBlock, combineAuditDescriptionParts } = require("../../../../../commands/audits/audit");
const { EmbedBuilder, ButtonBuilder, ActionRowBuilder } = require("discord.js");

module.exports = async (client, auditEmbed, auditActionRow, right = true) => {
	const pageModifier = right ? 1 : -1;

	const pageNumbers = auditEmbed.footer.text.match(/\d+/g)
		.map(numberText => parseInt(numberText));
	const newPageIndex = pageNumbers[0] - 1 + pageModifier; // Page 1 = Index 0, hence -1
	const maxPages = pageNumbers[1];
	 
	const auditeesPromise = await Auditee.find({})
										 .sort({judgedInInterim: -1}) // Sort descending
										 .skip(newPageIndex * parseInt(process.env.AUDITEES_PER_PAGE))
										 .limit(parseInt(process.env.AUDITEES_PER_PAGE))
										 .exec();
	
	const dateText = isolateDateText(auditEmbed.description);
	const submissionAndTotalBlocks = isolateSubmissionAndTotalBlocks(auditEmbed.description); // [0] = submissionsTable, [1] = totalBlock
	
	const sortedAuditees = await auditeesPromise;
	const judgeTableBlock = await generateJudgeTableBlock(client, sortedAuditees, newPageIndex * parseInt(process.env.AUDITEES_PER_PAGE));

	const editedEmbedBuilder = EmbedBuilder.from(auditEmbed)
		.setDescription(combineAuditDescriptionParts(dateText, judgeTableBlock, ...submissionAndTotalBlocks))
		.setFooter({
			text: `Page ${newPageIndex + 1} of ${maxPages}`, // +1 to get actual page number
			iconURL: auditEmbed.footer.iconURL
		});

	const calibratedActionRow = calibrateActionRow(auditActionRow, newPageIndex, maxPages);
	return {embeds: [editedEmbedBuilder], components: [calibratedActionRow]};
}

function isolateDateText(auditDescription) {
	return auditDescription.slice(0, auditDescription.indexOf("\n")); // First line is the date text
}

function isolateSubmissionAndTotalBlocks(auditDescription) {
	const blocks = Array(2);

	const matches = auditDescription.matchAll(/```/g);
	const matchArray = [...matches];

	let blockStartIndex;
	for(let i = 2; i < matchArray.length; i++) { // First two markers identify the judge table, which we manually generate for the new page
		if(i % 2 === 0) {
			blockStartIndex = matchArray[i].index;
		} else {
			let blockEndIndex = matchArray[i].index + matchArray[i][0].length; // matchArray[i][0] is the match itself
			blocks[Math.floor((i - 2) / 2)] = auditDescription.substring(blockStartIndex, blockEndIndex);
		}
	}
	return blocks;
}

function calibrateActionRow(actionRow, newPageIndex, maxPages) {
	const buttons = Array(actionRow.components.length);
	for(let i = 0; i < actionRow.components.length; i++) {
		const button = actionRow.components[i];
		const calibratedButtonBuilder = ButtonBuilder.from(button);
		if(button.data.custom_id === "next") calibratedButtonBuilder.setDisabled(newPageIndex + 1 === maxPages);
		else if(button.data.custom_id === "previous") calibratedButtonBuilder.setDisabled(newPageIndex + 1 === 1);

		buttons[i] = calibratedButtonBuilder;
	}

	return new ActionRowBuilder()
		.setComponents(...buttons);
}