import { BlobServiceClient } from '@azure/storage-blob'

async function main() {
  const client = BlobServiceClient.fromConnectionString('UseDevelopmentStorage=true')
  const container = client.getContainerClient('gazetta-test')
  await container.createIfNotExists()

  await container.getBlockBlobClient('test.txt').upload('hello', 5)
  console.log('write: OK')

  const dl = await container.getBlockBlobClient('test.txt').download()
  const chunks: Buffer[] = []
  for await (const chunk of dl.readableStreamBody!) chunks.push(chunk as Buffer)
  console.log('read:', Buffer.concat(chunks).toString())

  console.log('exists:', await container.getBlockBlobClient('test.txt').exists())
  console.log('not exists:', await container.getBlockBlobClient('nope').exists())

  for await (const b of container.listBlobsFlat()) console.log('list:', b.name)

  await container.delete()
  console.log('done')
}

main().catch(console.error)
