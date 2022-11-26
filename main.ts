import {App, MarkdownPostProcessorContext, MarkdownView, Plugin, PluginManifest} from "obsidian";

// Import XMLHttpRequest
import {XMLHttpRequest} from "xmlhttprequest";

interface CodeRunnerSettings {
	mySetting: string;
}

const DEFAULT_SETTINGS: CodeRunnerSettings = {
	mySetting: "default"
}

export default class CodeRunnerPlugin extends Plugin {
	settings: CodeRunnerSettings;
	languages: object;
	compilers: object;

	constructor(app: App, pluginManifest: PluginManifest) {
		super(app, pluginManifest);
	}

	async onload() {
		await this.loadSettings();

		// Load the available languages and compilers
		this.languages = await getLanguages();
		this.compilers = await getCompilers();

		console.log(this.languages);
		console.log(this.compilers);

		// Register the CodeBlock formatter
		this.registerMarkdownPostProcessor((element, context) => {
			codeBlockProcessor(element, context, this.app, this);
		});
	}

	onunload() {

	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

function extractCodeData(element: HTMLElement, context: MarkdownPostProcessorContext, app: App) {
	const codeBlock = context.getSectionInfo(element);

	if (!codeBlock) {
		return {"valid": false};
	}

	let fullProgram = "";
	for (let i: number = codeBlock.lineStart; i < codeBlock.lineEnd; ++i) {
		fullProgram += app.workspace.getActiveViewOfType(MarkdownView)?.editor.getLine(i);
	}

	// Locate the <compile> ... </compile> tags
	const compileTagMatch = fullProgram.match(/<compile>(.*?)<\/compile>/g);
	if (!compileTagMatch) {
		return {"valid": false};
	}

	const compileTagString = compileTagMatch[0];
	const code = fullProgram.substring(fullProgram.indexOf("</compile>") + 10);
	const config = JSON.parse(compileTagString.substring(9, compileTagString.length - 10));

	return {"valid": true, "code": code, "config": config}
}

function codeBlockProcessor(
	element: HTMLElement,
	context: MarkdownPostProcessorContext,
	app: App,
	plugin: CodeRunnerPlugin
) {
	const codeData = extractCodeData(element, context, app);

	if (!codeData.valid) {
		return;
	}

	console.log("Extracted information:");
	console.log(codeData);
	console.log(codeData.code);
}

function restfulApiRequest(method: string, url: string, data: object): Promise<any> {
	let toSend = null;

	if (method === "GET") {
		toSend = {
			method: method,
			headers: {
				"Accept": "application/json",
				"Content-Type": "application/json"
			}
		};
	} else {
		toSend = {
			method: method,
			headers: {
				"Accept": "application/json",
				"Content-Type": "application/json"
			},
			body: JSON.stringify(data)
		}
	}

	return fetch("https://godbolt.org" + url, toSend).then(response => response.json()).then(data => {
		return data;
	});
}

async function getLanguages(): Promise<object> {
	return restfulApiRequest("GET", "/api/languages", {});
}

async function getCompilers(languageID?: string): Promise<object> {
	if (languageID) {
		return restfulApiRequest("GET", "/api/compilers/" + languageID, {});
	} else {
		return restfulApiRequest("GET", "/api/compilers", {});
	}
}
