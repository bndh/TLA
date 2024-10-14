require("dotenv").config();

const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, time, TimestampStyles, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require("discord.js");

const { Auditee, Info, Judge, Submission } = require("../../mongo/mongoModels").modelData;

const Coloriser = require("../../utility/Coloriser");
const TextFormatter = require("../../utility/TextFormatter");
const { snapshot } = require("./snapshot");

const DIVIDER = Coloriser.color("│", "GREY");
// TODO Ditto '' for same interim values
module.exports = {
	data: new SlashCommandBuilder()
		.setName("audit")
		.setDescription("Manually perform an audit, displaying the contributions that each judge has made")
		.addBooleanOption(optionBuilder => optionBuilder
			.setName("overwrite")
			.setDescription("Whether or not to overwrite the last system state snapshot. (Default: false).")
			.setRequired(false)
		)
		.setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
	async execute(interaction) {
		await interaction.deferReply(); // Must await defer for proper error catching externally
	
		const overwrite = interaction.options.getBoolean("overwrite", false) ?? false;
		
		console.info(`COMMAND ${this.data.name} USED BY ${interaction.user.id} IN ${interaction.channelId} WITH overwrite ${overwrite}`);

		let snapshotPromise;
		if(overwrite) {
			snapshotPromise = snapshot(interaction.client);
		} else {
			const previousSnapshotExists = await Info.exists({id: "snapshotCreationTime"});
			if(!previousSnapshotExists) snapshotPromise = snapshot(interaction.client);
		}

		const replyPromise = generateReply(interaction.client);
		const disablePromise = disableOldAudit(interaction.client);

		const completionData = await Promise.all([replyPromise, snapshotPromise, disablePromise]);
		const response = await interaction.editReply(completionData[0]);

		await Promise.all([ // Await for error handling
			Info.updateOrCreate({id: "lastAuditChannelId"}, {data: response.channelId}),
			Info.updateOrCreate({id: "lastAuditMessageId"}, {data: response.id})
		]);
	},
	generateJudgeTableBlock, // Used externally in page turning mechanisms
	combineAuditDescriptionParts
};

async function disableOldAudit(client) {
	const channelData = await Info.findOne({id: "lastAuditChannelId"}).select({data: 1}).exec();
	const messageDataPromise = Info.findOne({id: "lastAuditMessageId"}).select({data: 1}).exec();

	let message;
	try {
		const channel = await client.channels.fetch(channelData.data);

		const messageData = await messageDataPromise;
		message = await channel.messages.fetch(messageData.data);
	} catch(error) {
		return;
	}
	
	const disabledEmbed = generateDisabledEmbed(message.embeds[0]);
	const disabledActionRow = generateDisabledActionRow(message.components[0]);

	if(!disabledEmbed && !disabledActionRow) return;
	const responseData = {};
	if(disabledEmbed) responseData.embeds = [disabledEmbed];
	if(disabledActionRow) responseData.components = [disabledActionRow];
	await message.edit(responseData);
}

function generateDisabledEmbed(embed) {
	if(!embed) return;

	const newLineIndex = embed.description.indexOf("\n");
	const dateText = embed.description.slice(0, newLineIndex); // Date always on first line
	const otherText = embed.description.slice(newLineIndex);

	const embedBuilder = EmbedBuilder.from(embed);
	embedBuilder.setDescription(
		dateText + "\n\n" + 
		"_This Audit Report is now **outdated**.\nPlease search for an **updated version** elsewhere._" +
		otherText // \n already attached
	);
	embedBuilder.setColor(process.env.FAIL_COLOR);
	return embedBuilder;
}

function generateDisabledActionRow(actionRow) {
	if(!actionRow) return;

	const disabledActionRow = new ActionRowBuilder();
	for(const button of actionRow.components) {
		const buttonBuilder = ButtonBuilder.from(button);
		buttonBuilder.setDisabled(true);
		disabledActionRow.addComponents(buttonBuilder);
	}
	return disabledActionRow;
}

async function generateReply(client) {
	const allAuditees = await prepareAuditees();
	const sortedAuditees = allAuditees.sort((auditeeA, auditeeB) => auditeeB.judgedInInterim - auditeeA.judgedInInterim);
	const visibleAuditees = sortedAuditees.slice(0, parseInt(process.env.AUDITEES_PER_PAGE));

	const auditEmbed = await generateAuditEmbed(client, visibleAuditees, allAuditees.length);
	const actionRow = generateActionRow(allAuditees.length);
	
	return {embeds: [auditEmbed], components: [actionRow]};
}

async function prepareAuditees() {
	const judgeDocs = await Judge.enqueue(() => Judge.find({}).exec());
	const deletionPromise = Auditee.deleteMany({userId: {$nin: judgeDocs.map(doc => doc.userId)}}).exec();

	const auditeePromises = Promise.all(judgeDocs.map(judgeDoc => createOrUpdateAuditee(judgeDoc)));

	const finishedPromises = await Promise.all([auditeePromises, deletionPromise]);
	return finishedPromises[0];
}

async function generateAuditEmbed(client, sortedAuditees, totalAuditees) {
	return EmbedBuilder.generateSuccessEmbed(await generateDescriptionText(client, sortedAuditees))
		.setTitle("__JUDGE AUDIT REPORT__")
		.setFooter({text: generateFooterText(totalAuditees), iconURL: "https://images.emojiterra.com/twitter/v14.0/512px/1f4c4.png"});
}

const nextButton = require("../../buttons/audit/next").data; // Must require after module.exports to avoid circular dependency issues
const previousButton = require("../../buttons/audit/previous").data;
const searchButton = require("../../buttons/audit/search").data;
function generateActionRow(auditeeCount) {
	nextButton.setDisabled(auditeeCount <= parseInt(process.env.AUDITEES_PER_PAGE)); // Only location the button is used so fine to mutate
	return new ActionRowBuilder()
		.setComponents(previousButton, searchButton, nextButton);
}

function generateFooterText(totalAuditees, pageNumber = 1) {
	const maxPages = Math.ceil(totalAuditees / parseInt(process.env.AUDITEES_PER_PAGE));
	return `Page ${pageNumber} of ${maxPages}`;
}

async function generateDescriptionText(client, sortedAuditees) {
	const descriptionParts = await Promise.all([
		generateDateText(),
		generateJudgeTableBlock(client, sortedAuditees),
		generateSubmissionTableBlock(),
		generateTotalBlock()
	]);

	return combineAuditDescriptionParts(...descriptionParts);
}

async function generateDateText() {
	const snapshotCreationInfo = await Info.findOne({id: "snapshotCreationTime"}).select({data: 1, _id: 0}).exec();
	const snapshotCreationTime = parseInt(snapshotCreationInfo.data);

	const formattedSnapshotTime = time(new Date(snapshotCreationTime), TimestampStyles.LongDate);
	const formattedCurrentTime = time(new Date(Date.now()), TimestampStyles.LongDate);

	return "_" + formattedSnapshotTime + " -> " + formattedCurrentTime + "_";
}

async function generateJudgeTableBlock(client, sortedAuditees, startingIndex = 0, maxPerPage = process.env.AUDITEES_PER_PAGE) { // Defined startingIndex and maxPerPage for external use
	const colouredTopFrame = Coloriser.color(process.env.AUDIT_FRAME_TOP, "GREY");
	const colouredTagFrame = Coloriser.colorFromMarkers(process.env.AUDIT_FRAME_TAG);
	const colouredMidFrame = Coloriser.color(process.env.AUDIT_FRAME_MID, "GREY");
	const colouredContents = await generateFormattedJudgeRows(client, sortedAuditees, startingIndex, maxPerPage);
	const colouredBotFrame = Coloriser.color(process.env.AUDIT_FRAME_BOT, "GREY");

	return "```ansi" + "\n" + // Enables colour highlighting
		   colouredTopFrame + "\n" + 
		   colouredTagFrame + "\n" +
		   colouredMidFrame + "\n" +
		   colouredContents + // \n already attached
		   colouredBotFrame + "```";
}

async function generateFormattedJudgeRows(client, auditees, startingIndex, maxPerPage) {
	// const auditeeUserData = await Promise.all(auditees.map(async auditee => client.users.fetch(auditee.userId)));
	// const auditeeDisplayNames = auditeeUserData.map(user => user.displayName);
	
	const guild = await client.guilds.fetch(process.env.GUILD_ID);
	const auditeeMemberData = await Promise.all(auditees.map(async auditee => {
		try {
			return await guild.members.fetch(auditee.userId);
		} catch(error) { // Member does not exist
			return await client.users.fetch(auditee.userId);
		}
	}));
	const auditeeNicknames = auditeeMemberData.map(memberData => memberData.nickname ?? memberData.displayName);

	let rows = "";
	for(let i = 0; i < auditees.length; i++) {
		rows += generateTableRow(startingIndex + i, auditees[i], auditeeNicknames[i]) + "\n";
	}
	for(let i = auditees.length; i < parseInt(maxPerPage); i++) {
		rows += Coloriser.color(process.env.AUDIT_FRAME_NIL, "GREY") + "\n";
	}

	return rows;
}

async function generateSubmissionTableBlock() {
	const countRowPromises = Promise.all([
		generateFormattedTagCounts(),
		generateFormattedSubCounts()
	]);

	const colouredTopFrame = Coloriser.color(process.env.SUBMISSION_FRAME_TOP, "GREY");
	const colouredTagFrame = Coloriser.colorFromMarkers(process.env.SUBMISSION_FRAME_TAG);
	const colouredMidFrame = Coloriser.color(process.env.SUBMISSION_FRAME_MID, "GREY");
	const colouredSubFrame = Coloriser.colorFromMarkers(process.env.SUBMISSION_FRAME_SUB);
	const colouredBotFrame = Coloriser.color(process.env.SUBMISSION_FRAME_BOT, "GREY");

	const countRows = await countRowPromises;
	const colouredTagCount = countRows[0];
	const colouredSubCount = countRows[1];

	return "```ansi" + "\n" +
		   colouredTopFrame + "\n" + 
		   colouredTagFrame + "\n" + 
		   colouredTagCount + "\n" + 
		   colouredMidFrame + "\n" + 
		   colouredSubFrame + "\n" + 
		   colouredSubCount + "\n" + 
		   colouredBotFrame + "```";
}

async function generateTotalBlock() {
	const count = await Submission.enqueue(() => Submission.countDocuments().exec());

	let countText = count.toString();
	const properCountLength = countText.length;

	countText = TextFormatter.resizeFront(count.toString(), 5, "0");
	countText = TextFormatter.resizeFront(countText, 38);
	countText = Coloriser.colorFromIndices(
		"Total Submissions:" + countText, 
		[0, 17, 56 - properCountLength], // 56 is the max embed block width, but 55 is used here as indices start at 0
		["WHITE", "GREY", "TEAL"] // White for "Total Submissions:", grey for leading 0's, and teal for the actual count
	);

	return "```ansi" + "\n" + 
		   countText +
		   "```";
}

function combineAuditDescriptionParts(dateText, judgeTableBlock, submissionTableBlock, totalBlock) {
	return dateText + "\n\n" +
		   "**" + judgeTableBlock + "** " +  // Discord puts these on different lines despite the lack of \n; with the \n there is a larger gap
		   "**" + submissionTableBlock + "** " + // Space included after the formatting markdown or it conflicts
		   "**_" + totalBlock + "_**";
}

async function createOrUpdateAuditee(judgeDoc) {
	const totalSubmissionsJudged = calculateTotalSubmissionsJudged(judgeDoc.counselledSubmissionIds, judgeDoc.totalSubmissionsClosed);
	const judgedInInterim = calculateJudgedInInterim(totalSubmissionsJudged, judgeDoc.snappedJudgedInterim, judgeDoc.snappedJudgedTotal);
	const interimChange = calculateInterimChange(judgedInInterim, judgeDoc.snappedJudgedInterim);
	// TODO maybe refer to judge doc
	return Auditee.updateOrCreate(
		{userId: judgeDoc.userId},
		{judgeType: judgeDoc.judgeType, judgedInInterim: judgedInInterim, interimChange: interimChange, totalSubmissionsJudged: totalSubmissionsJudged}
	);
}

function calculateTotalSubmissionsJudged(counselledSubmissionIds, totalSubmissionsClosed) {
	return counselledSubmissionIds.length + totalSubmissionsClosed;
}

function calculateJudgedInInterim(totalSubmissionsJudged, snappedJudgedInterim, snappedJudgedTotal) {
	if(snappedJudgedInterim !== undefined) return totalSubmissionsJudged - snappedJudgedTotal; // Conventional flow; not a new judge
	else return totalSubmissionsJudged; // A new judge (or one with 0 snappedJudgedTotal) is one implied to have been created since the last snapshot, so we just take judgedInInterim as their currentJudgedTotal
}

function calculateInterimChange(judgedInInterim, snappedJudgedInterim) {
	if(snappedJudgedInterim !== undefined) {
		if(snappedJudgedInterim !== 0) {
			return -100 + (judgedInInterim / snappedJudgedInterim * 100); // % change (e.g. 4n, 16b = -75%; 28n, 16b = +75%)
		} else {
			if(judgedInInterim === 0) return 0; // 0 judged before, 0 judged now, hence 0
			else return 9999; // ∞ symbol looks too sad so we just say 9999, the max
		}
	} else {
		return 9999;
	}
}

function generateTableRow(index, auditee, auditeeName) {
	let indexText = generateIndexText(index);
	let nameText = generateUserText(auditeeName, auditee.judgeType)
	let interimText = generateInterimText(auditee.judgedInInterim, auditee.interimChange);
	let totalText = generateTotalText(auditee.totalSubmissionsJudged);

	return `${DIVIDER} ${indexText} ${DIVIDER} ${nameText} ${DIVIDER} ${interimText} ${DIVIDER} ${totalText} ${DIVIDER}`;
}

function generateIndexText(index) {
	let placement = index + 1;
	if(placement >= 1000) placement = 999;
	let indexText = TextFormatter.digitiseNumber(placement, 3, placement <= 5 ? index : 6); // If it's >5, it will be coloured the same as the pipe (6: grey) which is appropriate
	return indexText;
}

function generateUserText(name, judgeType) {
	const sizedName = TextFormatter.resizeEnd(name, 16, " ", "..");

	let auditeeColorCode = 7;
	if(judgeType === "admin") auditeeColorCode = +process.env.ADMIN_COLOR_CODE;
	else if(judgeType === "nominator") auditeeColorCode = +process.env.NOMINATOR_COLOR_CODE;
	return Coloriser.color(sizedName, auditeeColorCode);
}

function generateInterimText(judgedInInterim, interimChange) {
	let changeColour;
	let changeSignSymbol;
	if(interimChange >= 0) {
		if(interimChange > 0) {
			changeColour = "GREEN";
			changeSignSymbol = "+";
		} else {
			changeColour = "YELLOW";
			changeSignSymbol = "=";
		}
	} else {
		changeColour = "RED";
		changeSignSymbol = "-";
	}
	const changeText = TextFormatter.digitiseNumber(Math.abs(interimChange), 6, changeColour, changeSignSymbol, "%"); // Absolute value or "--" will happen
	const quantityText = TextFormatter.digitiseNumber(judgedInInterim);
	const hiddenGreyCharacterLength = Coloriser.getColorCharacterLength("GREY") * 4;
	const hiddenColorCharacterLength = Coloriser.getColorCharacterLength("WHITE", changeColour);

	let interimText = quantityText + "  " + Coloriser.color("(", "GREY") + changeText + Coloriser.color(")", "GREY");
	interimText = interimText.padEnd(19 + (hiddenGreyCharacterLength + hiddenColorCharacterLength));
	return interimText;
}

function generateTotalText(currentJudgedTotal) {
	return TextFormatter.digitiseNumber(currentJudgedTotal);
}

const openStatuses = ["AWAITING DECISION", "AWAITING VETO", "PENDING APPROVAL"];
const closedStatuses = ["APPROVED", "REJECTED", "VETOED"];
const tagSizes = [24, 25];
async function generateFormattedTagCounts() {
	let counts = await Promise.all([
		Submission.enqueue(() => Submission.countDocuments({status: {$in: openStatuses}}).exec()),
		Submission.enqueue(() => Submission.countDocuments({status: {$in: closedStatuses}}).exec())
	]);
	for(let i = 0; i < counts.length; i++) {
		counts[i] = TextFormatter.digitiseNumber(counts[i], 5, "WHITE", undefined, undefined, tagSizes[i]);
	}

	return `${DIVIDER} ${counts[0]} ${DIVIDER} ${counts[1]} ${DIVIDER}`; // Using `` to add spaces around the dividers
}

const unvetoedStatuses = ["AWAITING VETO", "PENDING APPROVAL"];
const rejectedStatuses = ["REJECTED", "VETOED"];
const subSizes = [10, 11, 11, 11];
async function generateFormattedSubCounts() {
	const counts = await Promise.all([
		Submission.enqueue(() => Submission.countDocuments({status: "AWAITING DECISION"}).exec()),
		Submission.enqueue(() => Submission.countDocuments({status: {$in: unvetoedStatuses}}).exec()),
		Submission.enqueue(() => Submission.countDocuments({status: "APPROVED"}).exec()),
		Submission.enqueue(() => Submission.countDocuments({status: {$in: rejectedStatuses}}).exec())
	]);
	for(let i = 0; i < counts.length; i++) { // Fields are different sizes
		counts[i] = TextFormatter.digitiseNumber(counts[i], 5, "WHITE", undefined, undefined, subSizes[i]);
	}

	return `${DIVIDER} ${counts[0]} ${DIVIDER} ${counts[1]} ${DIVIDER} ${counts[2]} ${DIVIDER} ${counts[3]} ${DIVIDER}`;
}

