import { IsOptional, IsString } from 'class-validator';

export class CreateWorkflowDto {
    @IsString() name: string;
    @IsOptional() @IsString() description?: string;
    // graph and triggerRule are free-form JSON (validated at save/validate time)
}
