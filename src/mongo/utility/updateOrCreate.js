module.exports = async (Model, target, alteration, creationDefault) => {
	const response = await Model.updateOne(target, alteration).exec();
	if(response.matchedCount !== 0) return;
	await Model.create(creationDefault);
}