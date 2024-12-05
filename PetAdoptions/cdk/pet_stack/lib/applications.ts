import * as iam from 'aws-cdk-lib/aws-iam';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as eks from 'aws-cdk-lib/aws-eks';
import * as resourcegroups from 'aws-cdk-lib/aws-resourcegroups';
import { DockerImageAsset } from 'aws-cdk-lib/aws-ecr-assets';
import * as yaml from 'js-yaml';
import { Stack, StackProps, CfnJson, Fn, CfnOutput } from 'aws-cdk-lib';
import { readFileSync } from 'fs';
import { Construct } from 'constructs'
import { ContainerImageBuilderProps, ContainerImageBuilder } from './common/container-image-builder'
import { PetAdoptionsHistory } from './applications/pet-adoptions-history-application'

export class Applications extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope,id,props);

    const stackName = id;

    const roleArn = ssm.StringParameter.fromStringParameterAttributes(this, 'getParamClusterAdmin', { parameterName: "/eks/baniluxsvc/EKSMasterRoleArn"}).stringValue;
    const targetGroupArn = ssm.StringParameter.fromStringParameterAttributes(this, 'getParamTargetGroupArn', { parameterName: "/eks/baniluxsvc/TargetGroupArn"}).stringValue;
    const oidcProviderUrl = ssm.StringParameter.fromStringParameterAttributes(this, 'getOIDCProviderUrl', { parameterName: "/eks/baniluxsvc/OIDCProviderUrl"}).stringValue;
    const oidcProviderArn = ssm.StringParameter.fromStringParameterAttributes(this, 'getOIDCProviderArn', { parameterName: "/eks/baniluxsvc/OIDCProviderArn"}).stringValue;
    const rdsSecretArn = ssm.StringParameter.fromStringParameterAttributes(this, 'getRdsSecretArn', { parameterName: "/banilux/rdssecretarn"}).stringValue;
    const petHistoryTargetGroupArn = ssm.StringParameter.fromStringParameterAttributes(this, 'getPetHistoryParamTargetGroupArn', { parameterName: "/eks/pethistory/TargetGroupArn"}).stringValue;

    const cluster = eks.Cluster.fromClusterAttributes(this, 'MyCluster', {
      clusterName: 'BaniluxService',
      kubectlRoleArn: roleArn,
    });
    // ClusterID is not available for creating the proper conditions https://github.com/aws/aws-cdk/issues/10347
    // Thsos might be an issue
    const clusterId = Fn.select(4, Fn.split('/', oidcProviderUrl)) // Remove https:// from the URL as workaround to get ClusterID

    const stack = Stack.of(this);
    const region = stack.region;

    const app_federatedPrincipal = new iam.FederatedPrincipal(
        oidcProviderArn,
        {
            StringEquals: new CfnJson(this, "App_FederatedPrincipalCondition", {
                value: {
                    [`oidc.eks.${region}.amazonaws.com/id/${clusterId}:aud` ]: "sts.amazonaws.com"
                }
            })
        }
    );
    const app_trustRelationship = new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        principals: [ app_federatedPrincipal ],
        actions: ["sts:AssumeRoleWithWebIdentity"]
    })


    // FrontEnd SA (SSM, SQS, SNS)
    const baniluxserviceaccount = new iam.Role(this, 'BaniluxServiceServiceAccount', {
//                assumedBy: eksFederatedPrincipal,
            assumedBy: new iam.AccountRootPrincipal(),
        managedPolicies: [
            iam.ManagedPolicy.fromManagedPolicyArn(this, 'BaniluxServiceServiceAccount-AmazonSSMFullAccess', 'arn:aws:iam::aws:policy/AmazonSSMFullAccess'),
            iam.ManagedPolicy.fromManagedPolicyArn(this, 'BaniluxServiceServiceAccount-AmazonSQSFullAccess', 'arn:aws:iam::aws:policy/AmazonSQSFullAccess'),
            iam.ManagedPolicy.fromManagedPolicyArn(this, 'BaniluxServiceServiceAccount-AmazonSNSFullAccess', 'arn:aws:iam::aws:policy/AmazonSNSFullAccess'),
            iam.ManagedPolicy.fromManagedPolicyArn(this, 'BaniluxServiceServiceAccount-AWSXRayDaemonWriteAccess', 'arn:aws:iam::aws:policy/AWSXRayDaemonWriteAccess')
        ],
    });
    baniluxserviceaccount.assumeRolePolicy?.addStatements(app_trustRelationship);

    const startStepFnExecutionPolicy = new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
            'states:StartExecution'
        ],
        resources: ['*']
        });

    baniluxserviceaccount.addToPrincipalPolicy(startStepFnExecutionPolicy);

    const baniluxsvcAsset = new DockerImageAsset(this, 'baniluxsvcAsset', {
        directory: "./resources/microservices/baniluxsvc/baniluxsvc/"
    });


    var manifest = readFileSync("./resources/k8s_baniluxsvc/deployment.yaml","utf8");
    var deploymentYaml = yaml.loadAll(manifest) as Record<string,any>[];

    deploymentYaml[0].metadata.annotations["eks.amazonaws.com/role-arn"] = new CfnJson(this, "deployment_Role", { value : `${baniluxserviceaccount.roleArn}` });
    deploymentYaml[2].spec.template.spec.containers[0].image = new CfnJson(this, "deployment_Image", { value : `${baniluxsvcAsset.imageUri}` });
    deploymentYaml[3].spec.targetGroupARN = new CfnJson(this,"targetgroupArn", { value: `${targetGroupArn}`})

    const deploymentManifest = new eks.KubernetesManifest(this,"baniluxsvcdeployment",{
        cluster: cluster,
        manifest: deploymentYaml
    });

    // PetAdoptionsHistory application definitions-----------------------------------------------------------------------
    const petAdoptionsHistoryContainerImage = new ContainerImageBuilder(this, 'pet-adoptions-history-container-image', {
       repositoryName: "pet-adoptions-history",
       dockerImageAssetDirectory: "./resources/microservices/petadoptionshistory-py",
    });
    new ssm.StringParameter(this,"putPetAdoptionHistoryRepositoryName",{
        stringValue: petAdoptionsHistoryContainerImage.repositoryUri,
        parameterName: '/banilux/pethistoryrepositoryuri'
    });

    const petAdoptionsHistoryApplication = new PetAdoptionsHistory(this, 'pet-adoptions-history-application', {
        cluster: cluster,
        app_trustRelationship: app_trustRelationship,
        kubernetesManifestPath: "./resources/microservices/petadoptionshistory-py/deployment.yaml",
        otelConfigMapPath: "./resources/microservices/petadoptionshistory-py/otel-collector-config.yaml",
        rdsSecretArn: rdsSecretArn,
        region: region,
        imageUri: petAdoptionsHistoryContainerImage.imageUri,
        targetGroupArn: petHistoryTargetGroupArn
    });

    this.createSsmParameters(new Map(Object.entries({
        '/eks/baniluxsvc/stackname': stackName
    })));

    this.createOuputs(new Map(Object.entries({
        'BaniluxServiceECRImageURL': baniluxsvcAsset.imageUri,
        'baniluxServiceAccountArn': baniluxserviceaccount.roleArn,
    })));
    // Creating AWS Resource Group for all the resources of stack.
    const applicationsCfnGroup = new resourcegroups.CfnGroup(this, 'ApplicationsCfnGroup', {
        name: stackName,
        description: 'Contains all the resources deployed by Cloudformation Stack ' + stackName,
        resourceQuery: {
          type: 'CLOUDFORMATION_STACK_1_0',
        }
    });
  }

  private createSsmParameters(params: Map<string, string>) {
    params.forEach((value, key) => {
        //const id = key.replace('/', '_');
        new ssm.StringParameter(this, key, { parameterName: key, stringValue: value });
    });
    }

    private createOuputs(params: Map<string, string>) {
    params.forEach((value, key) => {
        new CfnOutput(this, key, { value: value })
    });
    }
}
