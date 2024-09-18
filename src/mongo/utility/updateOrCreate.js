module.exports = async (Model, target, alteration, creationDefault, synced = true, returnUpdated = true) => { // Synced used for executor support
	let response;
	if(Model.enqueue && synced) response = await Model.enqueue(() => Model.updateOne(target, alteration).exec());
	else response = await Model.findOneAndUpdate(target, alteration, {new: returnUpdated}).exec();
	if(response) return response; // Already exists, therefore the job is done

	if(Model.enqueue && synced) return Model.enqueue(() => Model.create(creationDefault));
	return Model.create(creationDefault);
}

// TODO PREDICTIVE CREATION DEFAULT is a good idea