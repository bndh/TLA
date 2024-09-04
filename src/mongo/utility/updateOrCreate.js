module.exports = async (Model, target, alteration, creationDefault, synced = true) => { // Synced used for executor support
	let response;
	if(Model.enqueue && synced) response = await Model.enqueue(() => Model.updateOne(target, alteration).exec());
	else response = await Model.updateOne(target, alteration).exec();

	if(response.matchedCount !== 0) return;
	if(Model.enqueue && synced) await Model.enqueue(() => Model.create(creationDefault))
	else await Model.create(creationDefault);
}

// TODO PREDICTIVE CREATION DEFAULT is a good idea