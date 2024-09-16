require("dotenv").config();

const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, time, TimestampStyles } = require("discord.js");

const Info = require("../../mongo/Info");
const Judge = require("../../mongo/Judge");
const getAllThreads = require("../../utility/discord/threads/getAllThreads");
const capitalise = require("../../utility/capitalise");
const Coloriser = require("../../utility/Coloriser");
const TextFormatter = require("../../utility/TextFormatter");
// TODO check code considering falsy 0
// TODO consider changing interim resolution to 5 places
module.exports = {
	data: new SlashCommandBuilder()
		.setName("audit")
		.setDescription("Manually perform an audit, displaying the contributions that each judge has made")
		.addBooleanOption(optionBuilder => optionBuilder
			.setName("overwrite")
			.setDescription("Whether or not to overwrite the last system state snapshot. (Default: true).")
			.setRequired(false)
		)
		.setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
	async execute(interaction) {
		const deferPromise = interaction.deferReply();

		const auditEmbed = await generateAuditEmbed(interaction.client);

		await deferPromise;
		interaction.editReply({embeds: [auditEmbed]});
	}
}

async function generateAuditEmbed(client) {
	return new EmbedBuilder() // Everything except 
		.setAuthor({name: "TLA Admin Team", iconURL: "https://cdn.discordapp.com/app-icons/1206590967155531856/8e9b1189eab3a2cba17baa92327ac624.png", url: "https://www.youtube.com/@bndh4409"})
		.setTitle("__*JUDGE AUDIT REPORT*__")
		.setFooter({text: "Page 1 of 10", iconURL: "https://images.emojiterra.com/twitter/v14.0/512px/1f4c4.png"})
		.setColor(process.env.AUDIT_COLOR)
		.setDescription(await generateDescriptionText(client));
}

function generateActionRow() {

}

function snapshotJudgeData() {
	
}

async function generateDescriptionText(client) {
	const snapshotCreationInfo = await Info.findOne({id: "snapshotCreationTime"}).select({data: 1, _id: 0}).exec();
	const snapshotCreationTime = +snapshotCreationInfo.data;

	const judgeDocuments = await Judge.enqueue(() => Judge.find({}));

	return generateDateText(snapshotCreationTime) + "\n" +
		   await generateJudgeTableText(judgeDocuments, client);
}

function generateDateText(snapshotCreationTime) {
	const formattedSnapshotTime = time(new Date(snapshotCreationTime), TimestampStyles.LongDate);
	const formattedCurrentTime = time(new Date(Date.now()), TimestampStyles.LongDate);
	return "_" + formattedSnapshotTime + " -> " + formattedCurrentTime + "_";
}

async function generateJudgeTableText(judgeDocuments, client) {
	const colouredTopFrame = Coloriser.color(process.env.AUDIT_FRAME_TOP, "GREY");
	const colouredTagFrame = Coloriser.colorFromMarkers(process.env.AUDIT_FRAME_TAG);
	const colouredMidFrame = Coloriser.color(process.env.AUDIT_FRAME_MID, "GREY");

	let contents = "";
	attachIntervalAndTotalProperties(judgeDocuments);
	const sortedJudgeDocuments = sortJudgeDocuments(judgeDocuments); // Sorts based on judgedInInterval
	for(let i = 0; i < sortedJudgeDocuments.length; i++) {
		attachIntervalChange(sortedJudgeDocuments[i]);
		contents += await generateTableRow(i, sortedJudgeDocuments[i], client) + "\n";
	}

	const colouredBotFrame = Coloriser.color(process.env.AUDIT_FRAME_BOT, "GREY");

	return "```ansi" + "\n" + // Enables colour highlighting
		   colouredTopFrame + "\n" + 
		   colouredTagFrame + "\n" +
		   colouredMidFrame + "\n" +
		   contents + // \n already attached
		   colouredBotFrame +
		   "```";
}

function attachIntervalAndTotalProperties(judgeDocuments) {
	judgeDocuments.forEach(judgeDocument => {
		judgeDocument.currentJudgedTotal = judgeDocument.counselledSubmissionIds.length + judgeDocument.totalSubmissionsClosed; // Used later
		if(judgeDocument.snappedJudgedInterval) judgeDocument.judgedInInterval = judgeDocument.currentJudgedTotal - judgeDocument.snappedJudgedInterval; // Conventional flow; not a new judge
		else judgeDocument.judgedInInterval = judgeDocument.currentJudgedTotal; // A new judge is one implied to have been created since the last snapshot, so we just take judgedInInterval as their currentJudgedTotal
	});
}

function sortJudgeDocuments(judgeDocuments) {
	return judgeDocuments.sort((docA, docB) => docB.judgedInInterval - docA.judgedInInterval);
}

function attachIntervalChange(judgeDocument) { // % change compared to last judgedInInterval value
	if(judgeDocument.snappedJudgedInterval !== undefined) {
		if(judgeDocument.snappedJudgedInterval !== 0) {
			judgeDocument.intervalChange = judgeDocument.judgedInInterval / judgeDocument.snappedJudgedInterval * 100; // %
			judgeDocument.intervalChange = -100 + judgeDocument.intervalChange; // % change (e.g. 4n, 16b = -75%; 28n, 16b = +75%)
			judgeDocument.intervalChange = Math.min(Math.max(judgeDocument.intervalChange, -1000), 1000); // Snap between -1000 and 1000; becomes 999+%
		} else {
			if(judgeDocument.judgedInInterval === 0) judgeDocument.intervalChange = 0; // 0 judged before, 0 judged now, hence 0
			else judgeDocument.intervalChange = 1000; // ∞ symbol looks too sad so we just say >999
		}
	} else {
		judgeDocument.intervalChange = "N/A"; // Unique placeholder value: N/A%
	}
}

async function generateTableRow(index, modifiedJudgeDoc, client) {
	let indexText = generateIndexText(index);
	let usernameText = await generateUserText(modifiedJudgeDoc, client);
	let interimText = generateInterimText(modifiedJudgeDoc);
	let totalText = generateTotalText(modifiedJudgeDoc);

	const divider = Coloriser.color("|", "GREY");
	return `${divider} ${indexText} ${divider} ${usernameText} ${divider} ${interimText} ${divider} ${totalText} ${divider}`;
}

function generateSubmissionTableText() {

}

function generateIndexText(index) {
	let indexText = TextFormatter.resizeEnd(index.toString(), 3, " ", "..");
	if(index <= 5) indexText = Coloriser.color(indexText, index); // If it's >5, it will be coloured the same as the pipe (grey) which is appropriate
	return indexText;
}

async function generateUserText(modifiedJudgeDoc, client) {
	const user = await client.users.fetch(modifiedJudgeDoc.userId);
	let userColorCode = 7;
	if(modifiedJudgeDoc.judgeType === "admin") userColorCode = +process.env.ADMIN_COLOR_CODE;
	else if(modifiedJudgeDoc.judgeType === "nominator") userColorCode = +process.env.NOMINATOR_COLOR_CODE;
	let usernameText = TextFormatter.resizeEnd(user.username, 16, " ", "..");
	return Coloriser.color(usernameText, userColorCode);
}

function generateInterimText(modifiedJudgeDoc) {
	let quantityText;
	if(modifiedJudgeDoc.judgedInInterval >= 1000) quantityText = ">999";
	else quantityText = modifiedJudgeDoc.judgedInInterval.toString();
	const properQuantityLength = quantityText.length; // Used later for colouring
	quantityText = TextFormatter.resizeFront(quantityText, 4, "0");

	let changeText;
	let changeTextColor;
	let properChangeLength;
	if(typeof modifiedJudgeDoc.intervalChange === "number") {
		if(Math.abs(modifiedJudgeDoc.intervalChange) >= 1000) changeText = ">999";
		else changeText = Math.round(Math.abs(modifiedJudgeDoc.intervalChange)).toString(); // Significance indicated by colour
		properChangeLength = changeText.length; // Used later for colouring
		changeText = TextFormatter.resizeFront(changeText, 4, "0");
		changeTextColor = modifiedJudgeDoc.intervalChange >= 0 ? modifiedJudgeDoc.intervalChange > 0 ? "GREEN" : "YELLOW" : "RED";
	} else {
		changeText = modifiedJudgeDoc.intervalChange;
		properChangeLength = modifiedJudgeDoc.intervalChange.length;
		if(changeText === "∞") changeTextColor = "GREEN";
		else if(changeText === "N/A") changeTextColor = "YELLOW";
		changeText = TextFormatter.resizeFront(changeText, 4, " ");
	}

	let interimText = quantityText + "   (" + changeText + "%)";
	interimText = TextFormatter.resizeEnd(interimText, 19);
	interimText = Coloriser.colorIndices(
		interimText,
		[
			0, // Leading 0s
			4 - properQuantityLength, // Quantity value
			6, // Leading % bracket and 0s
			8 + (4 - properChangeLength), // Change value
			13 // Closing bracket
		],
		[
			"GREY",
			"WHITE",
			"GREY",
			changeTextColor,
			"GREY"
		]
	);
	return interimText;
}

function generateTotalText(modifiedJudgeDoc) {
	let totalText = modifiedJudgeDoc.currentJudgedTotal.toString();
	if(modifiedJudgeDoc.currentJudgedTotal >= 10000) totalText = "9999+"; // In some insane universe
	const properTotalLength = totalText.length;
	totalText = TextFormatter.resizeFront(totalText, 5, "0");
	totalText = Coloriser.colorIndices(totalText, [0, 5 - properTotalLength], ["GREY", "WHITE"]);
	return totalText;
}