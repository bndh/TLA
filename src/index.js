require("dotenv").config();
const {Client, GatewayIntentBits, Collection, Partials} = require("discord.js");
const path = require("path");
const mongoose = require("mongoose");

const Submission = require("./mongo/Submission");

const getAllFilePaths = require("./utility/getAllFilePaths");
const getLocalCommands = require("./utility/getLocalCommands");
const handleVetoJudgement = require("./utility/discord/submissionsVeto/handleVetoJudgement");

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

async function checkChannel(channelId, channelName) {
	client.channels.fetch(channelId).catch(() => console.error(`Channel "${channelName}" ("${channelId}") not found! \nIt is strongly advised to set this .env value and restart.`));
}

async function startPendingCountdowns() {
	const pendingThreads = await Submission.enqueue(() => Submission.find({expirationTime: {$gte: 0}})); // Slightly hacky way of making this work
	for(const pendingThread of pendingThreads) {
		setTimeout(
			() => handleVetoJudgement(client, pendingThread.threadId),
			pendingThread.expirationTime - Date.now().valueOf()
		);
		console.log(`Set Timeout for ${pendingThread.threadId} in ${pendingThread.expirationTime - Date.now().valueOf()}ms`);
	}
}