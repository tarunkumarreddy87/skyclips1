import uuid
from unittest.mock import AsyncMock, MagicMock, patch
import pytest
from fastapi import HTTPException
from app.api.routes.image_cutout import remove_background, CutoutRequest

@pytest.mark.asyncio
async def test_rejects_foreign_project_source():
    project = uuid.uuid4()
    service = MagicMock(get_project=AsyncMock())
    storage = MagicMock()
    with pytest.raises(HTTPException) as error:
        await remove_background(project, CutoutRequest(sourceKey='projects/another/image.png'), object(), service, storage)
    assert error.value.status_code == 403
    storage.get_object_bytes.assert_not_called()

@pytest.mark.asyncio
async def test_cutout_saved_separately_and_cached():
    project = uuid.uuid4()
    source = f'projects/{project}/image.png'
    service = MagicMock(get_project=AsyncMock())
    storage = MagicMock(bucket='media')
    storage.client.head_object.side_effect = [{'ContentLength': 4}, Exception('missing')]
    storage.get_object_bytes.return_value = b'data'
    storage.public_download_url.side_effect = lambda key: f'https://media.test/{key}'
    with patch('app.api.routes.image_cutout.cutout', return_value=b'png') as process:
        result = await remove_background(project, CutoutRequest(sourceKey=source), object(), service, storage)
        assert result['s3Key'] != source
        storage.upload_bytes.assert_called_once_with(result['s3Key'], b'png', 'image/png')
        storage.client.head_object.side_effect = [{'ContentLength': 4}, {}]
        await remove_background(project, CutoutRequest(sourceKey=source), object(), service, storage)
        process.assert_called_once()

@pytest.mark.asyncio
async def test_processing_failure_keeps_original():
    project = uuid.uuid4()
    storage = MagicMock(bucket='media')
    storage.client.head_object.side_effect = [{'ContentLength': 4}, Exception('missing')]
    storage.get_object_bytes.return_value = b'data'
    with patch('app.api.routes.image_cutout.cutout', side_effect=RuntimeError('model unavailable')):
        with pytest.raises(HTTPException) as error:
            await remove_background(project, CutoutRequest(sourceKey=f'projects/{project}/image.png'), object(), MagicMock(get_project=AsyncMock()), storage)
        assert error.value.status_code == 503
    storage.upload_bytes.assert_not_called()

@pytest.mark.asyncio
async def test_internal_cutout_retains_project_boundary():
    from app.api.routes.image_cutout import remove_background_internal
    storage = MagicMock()
    with pytest.raises(HTTPException) as error:
        await remove_background_internal(uuid.uuid4(), CutoutRequest(sourceKey='projects/other/image.png'), storage)
    assert error.value.status_code == 403
    storage.get_object_bytes.assert_not_called()
