require("dotenv").config();
const {Client, GatewayIntentBits, Collection, Partials, EmbedBuilder, time, TimestampStyles, ButtonBuilder, ButtonStyle, ActionRowBuilder} = require("discord.js");
const path = require("path");
const mongoose = require("mongoose");

const Submission = require("./mongo/Submission");

const getAllFilePaths = require("./utility/getAllFilePaths");
const getLocalCommands = require("./utility/getLocalCommands");
const handleVetoJudgement = require("./utility/discord/submissionsVeto/handleVetoJudgement");
const getUnjudgedThreads = require("./utility/discord/threads/getUnjudgedThreads");
const getAllThreads = require("./utility/discord/threads/getAllThreads");
const hasReacted = require("./utility/discord/reactions/hasReacted");
const capitalise = require("./utility/capitalise");
const color = require("./utility/Coloriser");
const Coloriser = require("./utility/Coloriser");
const TextFormatter = require("./utility/TextFormatter");

client = new Client({
	intents: [
		GatewayIntentBits.Guilds,
		GatewayIntentBits.GuildMessageReactions,
		GatewayIntentBits.GuildMembers,
		GatewayIntentBits.GuildMessages,
		GatewayIntentBits.MessageContent
	],
	partials: [
		Partials.Channel, // Required to listen for uncached things
		Partials.Message,
		Partials.Reaction
	]
});

(async () => {
	await mongoose.connect(process.env.MONGODB_URI);
	console.log("Connected to Mongoose!");

	loadCommands();
	registerListeners();
	await client.login(process.env.TOKEN);
	await checkChannels();
	startPendingCountdowns();

	// console.log(process.env.AUDIT_FRAME_TAG.split(/(\|)/).slice(1, -1));

	// const string = "| aaa | bbb | ccc | ddd | eee |"
	// console.log(string.split(/(\|)/).filter(text => text));
	// const coloured = Coloriser.colorArray(
	// 	string.split(/(\|)/).filter(text => text),
	// 	index => {
	// 		console.log(index);
	// 		if(index % 2 === 0) return 5;
	// 		else return Math.floor(index / 2);
	// 	}
	// );
	// console.log(coloured.join(""))

	//intervalChange = -100 + judgedInInterval; // % change (e.g. 4n, 16b = -75%; 28n, 16b = +75%)
	//intervalChange = Math.min(Math.max(intervalChange, -1000), 1000); // Snap between -1000 and 1000
	


	// 	const embed = new EmbedBuilder()
// 		.setTitle("__JUDGE AUDIT REPORT__")
// 		.setColor(0x30df88)
// 		.setAuthor({ name: 'TLA Admin Team', iconURL: "https://cdn.discordapp.com/app-icons/1206590967155531856/8e9b1189eab3a2cba17baa92327ac624.png", url: "https://www.youtube.com/@bndh4409" })
// 		.setTimestamp(Date.now())
// 		.setFooter({text: "Page 1 of 10", iconURL: "https://images.emojiterra.com/twitter/v14.0/512px/1f4c4.png"})
// 		.setDescription(`_${time(new Date(Date.now()), TimestampStyles.LongDate)} -> ${time(new Date(Date.now() + 999999999), TimestampStyles.LongDate)}_
// \`\`\`ansi
// [2;30m╒════╤══════════════╤════════════╤═════════════╤═══════╕[0m
// [2;30m│[0m [2;30m#[0m  [2;30m│[0m [2;33m[2;31mJudge        [0m[2;33m[0m[2;30m│[0m [2;33mType       [0m[2;30m│[0m [2;32mJudged [0m[2;32min   [0m[2;30m│[0m [2;36mTotal [0m[2;30m│[0m
// [2;30m│    │              │[0m            [2;30m│[0m [2;32mInterim     [0m[2;30m│[0m       [2;30m│[0m
// [2;30m╞════╪══════════════╪════════════╪═════════════╪═══════╡[0m
// [2;30m│[0m [2;33m[2;31m1[0m[2;33m[0m  [2;30m│[0m ELOooooooo.. [2;30m│[0m [2;34m[2;36mNominator  [0m[2;34m[0m[2;30m│[0m 32 ([2;32m 1%[0m) [2;30m│[0m 1124  [2;30m│[0m
// [2;30m│[0m[2;37m [2;33m2[0m[2;37m[0m  [2;30m│[0m infection .. [2;30m│[0m [2;31mAdmin      [0m[2;30m│[0m 21 ( [2;31m129%[0m) [2;30m│[0m 89    [2;30m│[0m
// [2;30m│[0m [2;31m[2;34m[2;36m[2;32m3[0m[2;36m[0m[2;34m[0m[2;31m[0m  [2;30m│[0m chooberty    [2;30m│[0m [2;31mAdmin      [0m[2;30m│[0m 20 ([2;32m1794%[0m) [2;30m│[0m 526   [2;30m│[0m
// [2;30m│[0m [2;34m[2;36m4[0m[2;34m[0m  [2;30m│[0m swaggggybndh [2;30m│[0m [2;34m[2;36mNominator  [0m[2;34m[0m[2;30m│[0m 19 ( [2;33m0%[0m) [2;30m│[0m 21    [2;30m│[0m
// [2;30m│[0m [2;34m5[0m  [2;30m│[0m dongiedong   [2;30m│[0m [2;34m[2;36mNominator  [0m[2;34m[0m[2;30m│[0m 5  ([2;31m32[0m[2;31m%[0m) [2;30m│[0m 49    [2;30m│[0m
// [2;30m│ 6  │[0m[2;30m[0m [User]       [2;30m│[0m [2;33m[Type][0m     [2;30m│[0m V  ([2;31m[2;33mVV%[0m[2;31m[0m) [2;30m│[0m V     [2;30m│[0m
// [2;30m│ 7  │[0m [User]       [2;30m│[0m [2;33m[Type]  [0m   [2;30m│[0m W  ([2;33mWW%[0m) [2;30m│[0m W     [2;30m│[0m
// [2;30m│ 8  │[0m [User]       [2;30m│[0m [2;33m[Type]  [0m   [2;30m│[0m X  ([2;33mXX%[0m) [2;30m│[0m X     [2;30m│[0m
// [2;30m│ 9  │[0m [User]       [2;30m│[0m [2;33m[Type][0m     [2;30m│[0m Y  ([2;33mYY%[0m) [2;30m│[0m Y     [2;30m│[0m
// [2;30m│ 10 │[0m [User]       [2;30m│[0m [2;33m[Type][0m     [2;30m│[0m Z  ([2;33mZZ%[0m) [2;30m│[0m Z     [2;30m│[0m
// [2;30m╘════╧══════════════╧════════════╧═════════════╧═══════╛[0m
// \`\`\`\`\`\`ansi
// [2;30m╒══════════════════════════╤═══════════════════════════╕[0m
// [2;30m│[0m          [2;31mOPEN[0m            [2;30m│[0m          [2;32mCLOSED[0m           [2;30m│[0m
// [2;30m│[0m           137            [2;30m│[0m            527            [2;30m│[0m
// [2;30m╞════════════╤═════════════╪═════════════╤═════════════╡[0m
// [2;30m│[0m [2;31mUnscreened[0m [2;30m│[0m  [2;31mUnvetoed[0m   [2;30m│[0m  [2;32m[2;33m[2;32m[2;33mApproved[0m[2;32m[0m[2;33m[0m[2;32m[0m   [2;30m|[0m  [2;31m[2;32m[2;33m[2;32m[2;33mRejected[0m[2;32m[0m[2;33m[0m[2;32m[0m[2;31m[0m   [2;30m│[0m
// [2;30m│[0m     58     [2;30m│[0m     79      [2;30m│[0m     429     [2;30m│[0m     98      [2;30m|[0m
// [2;30m╘════════════╧═════════════╧═════════════╧═════════════╛[0m
// |          OPEN         |       CLOSED         | TOTAL |
// | Unscreened | Unvetoed | Approved | Rejected  |  XXXX |
// ╒═════╤══════════════════╤═════════════════════╤═══════╕
// |   # | Judge (LN/Admin) | Judged in Interim   | Total |
// ╞═════╪══════════════════╪═════════════════════╪═══════╡
// |   1 | bndhbndhbndhbn   |                     |       |
// ╞═════╪══════════════════╪═════════════════════╪═══════╡
// | 453 | bndhbndhbndhbndh |                     |       |
// ╘═════╧══════════════════╧═════════════════════╧═══════╛
//
//╒══════════════════════════╤═══════════════════════════╕
//│         O P E N          │        C L O S E D        |
//│           XXX            │            XXX            |
//╞════════════╤═════════════╪═════════════╤═════════════╡
//| Unscreened |  Unvetoed   |  Approved   |   Denied    |
//|     XXX    |     XXX     |     XXX     |     XXX     |
//╘════════════╧═════════════╧═════════════╧═════════════╛
//
// \`\`\`_\`\`\`ansi
// Total Submissions:                                   [2;32m[2;33m[2;36m664[0m[0m[2;33m[0m[2;32m[0m
// \`\`\`_

// `);

// 	const actionRow = new ActionRowBuilder().addComponents(
// 			new ButtonBuilder().setCustomId("first").setEmoji("⏮️").setStyle(ButtonStyle.Secondary),
// 			new ButtonBuilder().setCustomId("previous").setEmoji("◀️").setStyle(ButtonStyle.Primary),
// 			new ButtonBuilder().setCustomId("lock").setEmoji("🔐").setStyle(ButtonStyle.Danger),
// 			new ButtonBuilder().setCustomId("next").setEmoji("▶️").setStyle(ButtonStyle.Primary),
// 			new ButtonBuilder().setCustomId("last").setEmoji("⏭️").setStyle(ButtonStyle.Secondary)
// 	);
// 	channel.send({embeds: [embed], components: [actionRow]});
})();

function loadCommands() {
	client.commands = new Collection(); // Attach a commands property to our client which is accessible in other files

	for(const command of getLocalCommands(path.join(__dirname, "commands"))) {
		if("data" in command && "execute" in command) {
			client.commands.set(command.data.name, command); // Set a new item in the Collection with key as the command name and value as the command module itself
		} else {
			console.warn(`Command "${command.data.name}" is missing a required "data" or "execute" property.`);
		}
	}
}

function registerListeners() {
	for(const eventFilePath of getAllFilePaths(path.join(__dirname, "events"))) {
		const event = require(eventFilePath);
		if(event.once) {
			client.once(event.name, (...args) => event.execute(...args)); // Methods to register event listeners
		} else {
			client.on(event.name, (...args) => event.execute(...args));
		}
		console.info(`Registered: ${event.name}`);
	}
}

async function checkChannels() {
	checkChannel(process.env.SUBMISSIONS_INTAKE_ID, "Intake");
	checkChannel(process.env.SUBMISSIONS_FORUM_ID, "Submissions");
	checkChannel(process.env.VETO_FORUM_ID, "Veto");
}

async function startPendingCountdowns() {
	const pendingThreads = await Submission.enqueue(() => 
		Submission.find({status: "PENDING APPROVAL"})
				  .select({threadId: 1, expirationTime: 1, _id: 0})																
				  .exec()
	);
	if(!pendingThreads) return;

	for(const pendingThread of pendingThreads) {
		const timeout = pendingThread.expirationTime - Date.now().valueOf();
		setTimeout(() => handleVetoJudgement(client, pendingThread.threadId), timeout);
		console.log(`Set timeout for ${pendingThread.threadId} at ${timeout > 0 ? timeout : 0}ms`);
	}
}

async function checkChannel(channelId, channelName) {
	client.channels
		.fetch(channelId)
		.catch(() => console.error(`Channel "${channelName}" ("${channelId}") not found! \nIt is strongly advised to set this .env value and restart.`));
}