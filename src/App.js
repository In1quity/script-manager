import { createLogger } from '@utils/logger';
import {
	createBootstrapService,
	createReadinessFlow,
	createRuntimeContext
} from '@services/index';
import { Import } from '@services/imports';
import '@styles/index.css';

const logger = createLogger('app');
const context = createRuntimeContext({
	logger,
	ImportClass: Import
});

const readiness = createReadinessFlow(context);
const bootstrapService = createBootstrapService(context, readiness);

async function bootstrap() {
	try {
		await bootstrapService.run();
	} catch (error) {
		logger.error('Failed to initialize Script Manager runtime.', error);
	}
}

void bootstrap();
