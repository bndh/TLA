module.exports = {
	name	   : "/jsonify",
	definition : [
		"Provides a **json-converted** version of the **submission database**.",
		"An optional **pattern** integer may be used to **alter the export order**.",
		"Various filters are also available."
	],
	example    : [
		"/jsonify export-pattern: 3274 would export Upvotes, Video Title, Pending Expiration Time, and Downvotes in order, where:",
		"1: Video Link",
		"2: Video Title",
		"3: Upvotes",
		"4: Downvotes",
		"5: Status",
		"6: Close Time",
		"7: Pending Expiration Time",
		"8: Overturned",
		"9: Thread ID"
	],
	emoji	   : "🤖"
};