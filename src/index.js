require("dotenv").config();
const {Client, Collection, GatewayIntentBits, Partials, EmbedBuilder} = require("discord.js");
const path = require("path");

const mongoose = require("mongoose");
const mongoModels = require("./mongo/mongoModels");

const getAllExports = require("./utility/files/getAllExports"); // TODO infos disappearing
const pushEmbedFunctions = require("./utility/discord/messages/pushEmbedFunctions"); // TODO lock closed posts
const linkRegex = require("./utility/linkRegex");
const youtubeIdRegex = require("./utility/youtubeIdRegex");
const TextFormatter = require("./utility/TextFormatter");
const sendIndefiniteTyping = require("./utility/discord/messages/sendIndefiniteTyping");
// TODO await deferreplys, as long as await before method break, its fine, alteranativey .catch()?
const client = new Client({ // TODO fix admin override (doesnt actually re-deny)
	intents: [ // TODO change all statuses to upper case
		GatewayIntentBits.Guilds, // TODO delete all submissions docs that dont point anywhere
		GatewayIntentBits.GuildMessageReactions, // TODO sync beautification
		GatewayIntentBits.GuildMembers, // TODO Issue iwth intake sync??
		GatewayIntentBits.GuildMessages, // TODO check blue 
		GatewayIntentBits.MessageContent,
		GatewayIntentBits.DirectMessages
	],
	partials: [
		Partials.Channel, // TODO improve judge sync efficiency
		Partials.Message, // TODO judge self-stats
		Partials.Reaction // TODO automatically remove / add roles for delist and register
	] // TODO rebrand to TGA
}); // TODO NAT overwrite veto
// TODO let the LNs see whats going on in #submissions-2024 (read only list)
// TODO veto pendings with same votes get vetoed instead of approved
(async () => {
	mongoModels.setup(); // TODO status command
	await mongoose.connect(process.env.MONGODB_URI);
	console.log("Connected to Mongoose!"); 

	pushEmbedFunctions(); 
	loadCommands();
	registerListeners();
	await client.login(process.env.TOKEN);
	await checkChannels();
})();

function loadCommands() {
	client.commands = new Collection(); // Attach a commands property to our client which is accessible in other files

	const commands = getAllExports(path.join(__dirname, "commands"), file => !file.name.toLowerCase().endsWith("modules"));
	for(const command of commands) {
		if("data" in command && "execute" in command) {
			client.commands.set(command.data.name, command); // Set a new item in the Collection with key as the command name and value as the command module itself
		} else {
			console.warn(`Command "${command.data.name}" is missing a required "data" or "execute" property.`);
		}
	}
}

function registerListeners() {
	const events = getAllExports(path.join(__dirname, "events"));
	for(const event of events) {
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
	client.channels
		.fetch(channelId)
		.catch(() => console.error(`Channel "${channelName}" ("${channelId}") not found! \nIt is strongly advised to set this .env value and restart.`));
}