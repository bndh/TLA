module.exports = (channel) => {
	let typingFlag = {value: true}; 

	new Promise(async resolve => {
		while(typingFlag.value === true) {
			await channel.sendTyping(); // Wait until the request is actually sent before counting down
			await new Promise(innerResolve => setTimeout(innerResolve, 9000)); // Perform every 9s as typing lasts 10s, so we have 1s of leeway for the request to go through
		}
		resolve();
	});

	return typingFlag;
}