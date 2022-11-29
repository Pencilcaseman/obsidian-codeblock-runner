import {App, MarkdownPostProcessorContext, MarkdownView, Notice, Plugin, PluginManifest} from "obsidian";

let languages: [{
	extensions: Array<string>
	id: string
	monaco: string
	name: string
}];

let compilers: [
	{
		compilerType: string
		id: string
		instructionSet: string
		lang: string
		name: string
		semver: string
	}
];

const defaultCompilers = [
	{language: "c++", compiler: "g122"},
	{language: "c", compiler: "g122"},
	{language: "cuda", compiler: "nvcc117"},
	{language: "csharp", compiler: "dotnet700csharp"},
	{language: "rust", compiler: "r1650"},
	{language: "assembly", compiler: "llvmas700"},
	{language: "python", compiler: "python311"}
];

interface CodeRunnerSettings {
	mySetting: string;
}

const DEFAULT_SETTINGS: CodeRunnerSettings = {
	mySetting: "default"
}

export default class CodeRunnerPlugin extends Plugin {
	settings: CodeRunnerSettings;

	constructor(app: App, pluginManifest: PluginManifest) {
		super(app, pluginManifest);
	}

	async onload() {
		await this.loadSettings();

		// Load the available languages and compilers
		languages = await getLanguages();
		compilers = await getCompilers();

		console.log(languages);
		console.log(compilers);

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
		return {"valid": false, "reason": "Code block not found"};
	}

	let fullProgram = "";
	for (let i: number = codeBlock.lineStart; i < codeBlock.lineEnd; ++i) {
		fullProgram += app.workspace.getActiveViewOfType(MarkdownView)?.editor.getLine(i) + "\n";
	}

	// Locate the <compile> ... </compile> tags, including new lines
	const compileTagMatch = fullProgram.match(/<compile>([\s\S]*?)<\/compile>/);

	if (!compileTagMatch) {
		return {"valid": false, "reason": "Compile tags not found"};
	}

	const compileTagString = compileTagMatch[0];
	const code = fullProgram.substring(fullProgram.indexOf("</compile>") + 10);

	let config: object;
	try {
		config = JSON.parse(compileTagString.substring(9, compileTagString.length - 10));
	} catch {
		return {"valid": false, "reason": "Compile tag is not valid JSON"};
	}

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
		console.log("Code block was not runnable");
		console.log("Reason: ", codeData.reason)
		return;
	}

	const programConfig = generateProgramConfig(codeData.code, codeData.config);

	console.log("Extracted information:");
	console.log(codeData);
	console.log(codeData.code);

	console.log("Generated program config:");
	console.log();

	// Don't add more than once
	if (element.classList.contains("has-code-block-run-button")) {
		return;
	}

	element.classList.add("has-copy-button");

	const button = document.createElement("button");
	button.className = "code-runner-button";
	button.type = "button";
	button.innerText = "Run Code Block";

	button.addEventListener("click", () => {
		const compileResult = compileProgramConfig(programConfig);

		compileResult.then(result => {
			console.log("Result: ", result);

			// const outputText = processCompileOutput(result);

			// const lines: any = [].concat(result.buildResult.stdout, result.buildResult.stderr, result.stdout, result.asm, result.stderr);
			let lines: any[] = [];
			if (result.buildResult.stdout) { lines = lines.concat(result.buildResult.stdout); }
			if (result.buildResult.stderr) { lines = lines.concat(result.buildResult.stderr); }
			if (result.stdout) { lines = lines.concat(result.stdout); }
			if (result.asm) { lines = lines.concat(result.asm); }
			if (result.stderr) { lines = lines.concat(result.stderr); }

			console.log(lines);

			// Ensure we don't duplicate the output. Just update the existing block
			element.querySelector(".code-runner-output")?.remove();

			const output = element.children[element.children.length - 1].createEl("div", {cls: "code-runner-output"});
			let lineNumber = 0;
			for (const line of lines) {
				lineNumber++;
				let lineText = lineNumber.toString();
				lineText = lineText.padStart((lines.length - 1).toString().length, "0");

				console.log("Line: ", line);
				const div = output.createEl("div", {cls: "code-runner-output-line"});
				div.createEl("p", {cls: "code-runner-output-text code-runner-output-line-number"}).setText(lineText);
				div.createEl("p", {cls: "code-runner-output-text"}).setText(line.text);
			}
		});
	});

	element.children[0].insertBefore(button, element.children[0].children[0]);
}

function generateProgramConfig(source: any, config: any) {
	let valid = false;
	let language = "NONE";

	if (config.language) {
		language = config.language;
	} else {
		new Notice("A language must be specified for a code block to be runnable", 0);
		return null;
	}

	// Ensure that $language exists
	for (const validLanguage of languages) {
		if (language == validLanguage.id) {
			valid = true;
		}
	}

	if (!valid) {
		new Notice("Language '" + language + "' is not valid. For a list of valid languages, please see the settings page", 0);
		return null;
	}

	let compiler = "NONE";

	// If a compiler is specified, use that
	if (config.compiler) {
		compiler = config.compiler;
	} else {
		for (const defaultCompiler of defaultCompilers) {
			if (language == defaultCompiler.language) {
				compiler = defaultCompiler.compiler;
				break;
			}
		}
	}

	if (compiler == "NONE") {
		new Notice("Compiler '" + compiler + "' is not valid. For a list of valid compilers, please see the settings page", 0);
		return null;
	} else {
		valid = false;
		for (const validCompiler of compilers) {
			if (compiler == validCompiler.id) {
				valid = true;
				break;
			}
		}

		if (!valid) {
			new Notice("Compiler '" + compiler + "' is not valid. For a list of valid compilers, please see the settings page", 0);
			return null;
		}
	}

	let mode = "run";
	if (config.mode) {
		console.log("Debug Point");
		if (["run", "runner", "execute", "r"].includes(config.mode)) {
			mode = "run";
		} else if (["asm", "assembly", "a"].includes(config.mode)) {
			mode = "asm";
		} else {
			new Notice("Mode '" + config.mode + "' is not valid. For a list of valid modes, please see the settings page", 0);
			return null;
		}
	}

	let commandLine = "";
	if (config.commandLine) {
		commandLine = config.commandLine;
	}

	let args = [];
	if (config.args) {
		args = config.args;
	}

	let stdin = []
	if (config.stdin) {
		stdin = config.stdin;
	}

	let tools = [];
	if (config.tools) {
		tools = config.tools;
	}

	let libraries = [];
	if (config.libraries) {
		libraries = config.libraries;
	}

	// If we're just running the code (the default), use a simpler configuration
	console.log("Mode: " + mode);
	if (mode === "asm") {
		return {
			"source": source,
			"compiler": compiler,
			"options": {
				"userArguments": commandLine,
				"executeParameters": {
					"args": args,
					"stdin": stdin
				},
				"compilerOptions": {
					"skipAsm": false,
					"executorRequest": false
				},
				"filters": {
					"binary": false,
					"commentOnly": true,
					"demangle": true,
					"directives": true,
					"execute": false,
					"intel": true,
					"labels": true,
					"libraryCode": false,
					"trim": false
				},
				"tools": tools,
				"libraries": libraries
			},
			"lang": language,
			"allowStoreCodeDebug": true
		};
	} else {
		return {
			"source": source,
			"compiler": compiler,
			"options": {
				"userArguments": commandLine,
				"executeParameters": {
					"args": "",
					"stdin": ""
				},
				"compilerOptions": {
					"executorRequest": true
				},
				"filters": {
					"execute": true
				},
				"tools": tools,
				"libraries": libraries
			},
			"lang": language,
			"allowStoreCodeDebug": true
		}
	}
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

async function getLanguages(): Promise<[{
	extensions: Array<string>
	id: string
	monaco: string
	name: string
}]> {
	return restfulApiRequest("GET", "/api/languages", {});
}

async function getCompilers(languageID?: string): Promise<[
	{
		compilerType: string
		id: string
		instructionSet: string
		lang: string
		name: string
		semver: string
	}
]> {
	if (languageID) {
		return restfulApiRequest("GET", "/api/compilers/" + languageID, {});
	} else {
		return restfulApiRequest("GET", "/api/compilers", {});
	}
}

async function compileProgramConfig(config: any): Promise<{
	buildResult: {
		code: number
		compilationOptions: Array<string>
		downloads: Array<string>
		executableFilename: string
		stderr: Array<string>
		stdout: Array<string>
		timedOut: boolean
	},
	code: number,
	didExecute: boolean,
	execTime: string,
	okToCache: boolean,
	processExecutionResultTime: number,
	asm?: Array<{ text: string }>,
	stderr: Array<{ text: string }>,
	stdout: Array<{ text: string }>,
	timedOut: boolean
}> {
	return restfulApiRequest("POST", "/api/compiler/" + config.compiler + "/compile", config);
}
