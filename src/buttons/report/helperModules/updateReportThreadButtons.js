const calibrateButtonRow = require("../../../utility/discord/messages/calibrateButtonRow");

module.exports = async (thread, ifButtonIsOpen) => {
	const starterMessage = await thread.fetchStarterMessage();
	const calibratedActionRow = calibrateButtonRow(
		starterMessage.components[0],
		() => true,
		buttonBuilder => buttonBuilder.data.custom_id === "open" ? ifButtonIsOpen : !ifButtonIsOpen
	);
	return starterMessage.edit({components: [calibratedActionRow]});
}