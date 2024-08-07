module.exports = async (channel, maxPoll) => {
	let currentPoll = maxPoll;
	const initialPoll = await channel.messages.fetch({limit: 1});
	let earliestMessage = initialPoll.size === 1 ? initialPoll.at(0) : null; // Account for the possibility that there was no message
	currentPoll--;
	
	const polledMessages = [earliestMessage];

	while(currentPoll > 0 && earliestMessage) {
		const fetchLimit = currentPoll % 100 !== 0 ? currentPoll % 100 : 100; // Deal with the remainder to begin wtih
		const fetchedMessages = await channel.messages.fetch({limit: fetchLimit, before: earliestMessage.id});
		currentPoll -= fetchLimit;

		fetchedMessages.forEach(message => polledMessages.push(message));
		earliestMessage = fetchedMessages.size > 0 ? fetchedMessages.at(fetchedMessages.size - 1) : null; // Update the pointer to be the last of the fetched messages
	}
	
	return polledMessages;
}