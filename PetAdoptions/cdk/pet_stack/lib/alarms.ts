import { Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { IAlarm, Alarm, Metric, MathExpression } from 'aws-cdk-lib/aws-cloudwatch';
import { Duration } from 'aws-cdk-lib/core';


export class CloudWatchAlarms extends Stack {
    readonly listAdoptionLatencyAlarm: IAlarm;
    readonly statusUpdaterServiceFaultAlarm: IAlarm;
    readonly payForAdoptionFaultRateAlarm: IAlarm;
    readonly BaniluxsvcApplicationErrorAlarm: IAlarm;
    readonly petSearchFaultRateAlarm: IAlarm;

    constructor(scope: Construct, id: string, props: StackProps) {
        super(scope, id, props);

        // Alarm for test scenario: DDB Throttle
        const listAdoptionLatencyMetric = new Metric({
            namespace: 'BaniluxService',
            metricName: 'Time',
            statistic: 'p99',
            period: Duration.minutes(1),
            dimensionsMap: {
                Controller: 'PetListAdoptions',
                Action: 'Index',
            },
        });

        this.listAdoptionLatencyAlarm = new Alarm(this, 'ListAdoptionLatencyAlarm', {
            metric: listAdoptionLatencyMetric,
            threshold: 3000,
            evaluationPeriods: 5,
            alarmName: 'ListAdoptionLatencyAlarm',
        });

        // Alarm for test scenario: Deployment causes errors
        const statusUpdaterFaultMetric = new Metric({
            namespace: 'AWS/ApiGateway',
            metricName: '5XXError',
            statistic: 'Sum',
            period: Duration.minutes(5),
            dimensionsMap: {
                ApiName: 'PetAdoptionStatusUpdater',
            },
        });

        this.statusUpdaterServiceFaultAlarm = new Alarm(this, 'StatusUpdaterServiceFaultAlarm', {
            alarmDescription: 'Alarm showing fault count in Status Updater Service',
            metric: statusUpdaterFaultMetric,
            threshold: 1,
            evaluationPeriods: 2,
            alarmName: 'StatusUpdaterServiceFaultAlarm',
        });

        const payForAdoptionFaultRate = new Metric({
            namespace: 'PayForAdoption',
            metricName: '5xx',
            statistic: 'Average',
            dimensionsMap: {
                ApiName: 'PayForAdoption',
            },
            region: this.region,
            period: Duration.minutes(5),
        });

        const payForAdoptionFaultRateExpression = new MathExpression({
            label: 'payForAdoptionFaultRate',
            usingMetrics: {
                payForAdoptionFaultRate: payForAdoptionFaultRate,
            },
            expression: '100 * FILL(payForAdoptionFaultRate, 0)',
        });

        this.payForAdoptionFaultRateAlarm = new Alarm(this, 'PayForAdoptionFaultRateAlarm', {
            alarmDescription: 'Alarm showing fault rate in PayForAdoption ECS service',
            metric: payForAdoptionFaultRateExpression,
            threshold: 10,
            evaluationPeriods: 2,
            alarmName: 'PayForAdoptionFaultRateAlarm',
        });

        // Alarm for test scenario: SNS msg size limit exceeded
        const BaniluxsvcErrorRate = new Metric({
            namespace: 'BaniluxService',
            metricName: 'Time',
            statistic: 'SampleCount',
            region: this.region,
            dimensionsMap: {
                Action: 'Error',
                StatusCode: '500',
                Controller: 'Home',
            },
            period: Duration.minutes(1),
        });

        const BaniluxsvcErrorRateExpression = new MathExpression({
            label: 'BaniluxsvcErrorRate',
            usingMetrics: {
                BaniluxsvcErrorRate: BaniluxsvcErrorRate,
            },
            expression: 'FILL(BaniluxsvcErrorRate, 0)',
            period: Duration.minutes(1),
        });

        this.BaniluxsvcApplicationErrorAlarm = new Alarm(this, 'BaniluxServiceApplicationErrorAlarm', {
            alarmDescription: 'Alarm showing 500 status code error in BaniluxService API requests',
            metric: BaniluxsvcErrorRateExpression,
            threshold: 50,
            evaluationPeriods: 1,
            alarmName: 'BaniluxServiceApplicationErrorAlarm',
        });

        // Alarm for test scenario: Network Interruption
        const petSearchFaultCount = new Metric({
            namespace: 'ECS/AWSOTel/Application',
            metricName: 'requests',
            statistic: 'Sum',
            dimensionsMap: {
                apiName: '/api/search',
                OTelLib: 'petsearch',
                statusCode: '500',
            },
            region: this.region,
            period: Duration.minutes(1),
        });

        const petSearchRequestCount = new Metric({
            namespace: 'ECS/AWSOTel/Application',
            metricName: 'requests',
            statistic: 'Sum',
            dimensionsMap: {
                apiName: '/api/search',
                OTelLib: 'petsearch',
            },
            region: this.region,
            period: Duration.minutes(1),
        });

        const petSearchFaultRateExpression = new MathExpression({
            label: 'petSearchFaultRate',
            usingMetrics: {
                petSearchFaultCount: petSearchFaultCount,
                petSearchCount: petSearchRequestCount,
            },
            expression: 'petSearchFaultCount/petSearchCount',
        });

        this.petSearchFaultRateAlarm = new Alarm(this, 'PetSearchFaultRateAlarm', {
            alarmDescription: 'Alarm showing fault rate in PetSearch ECS service',
            metric: petSearchFaultRateExpression,
            threshold: 0.1,
            evaluationPeriods: 5,
            datapointsToAlarm: 2,
            alarmName: 'PetSearchFaultRateAlarm',
        });
    }
}